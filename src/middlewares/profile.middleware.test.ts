import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import { MoveType, UserType } from '@prisma/client';
import type { ErrorCode } from '../constants/error.codes';
import { AppError } from '../utils/app.error';
import { requireCompletedProfileForChatAttachment } from './profile.middleware';

interface MutableCustomerProfileRepository {
  findCustomerProfileByUserId: (
    userId: string
  ) => Promise<{ service: MoveType[] } | null>;
}

const customerProfileRepository =
  require('../repositories/customer-profile.repository') as MutableCustomerProfileRepository;

const originalFindCustomerProfileByUserId =
  customerProfileRepository.findCustomerProfileByUserId;

const USER_ID = '11111111-1111-4111-8111-111111111111';

const assertRejectsWithCode = async (
  fn: () => Promise<unknown>,
  code: ErrorCode
) => {
  await assert.rejects(fn, (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, code);
    return true;
  });
};

const runMiddleware = async (
  req: Request,
  res: Response
): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const next: NextFunction = (error?: unknown) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    };

    Promise.resolve(
      requireCompletedProfileForChatAttachment(req, res, next)
    ).catch(reject);
  });
};

describe('requireCompletedProfileForChatAttachment', () => {
  after(() => {
    customerProfileRepository.findCustomerProfileByUserId =
      originalFindCustomerProfileByUserId;
  });

  it('chat-attachments가 아니면 프로필 완료를 검사하지 않는다', async () => {
    let queried = false;
    customerProfileRepository.findCustomerProfileByUserId = async () => {
      queried = true;
      return null;
    };

    const req = {} as Request;
    const res = {
      locals: {
        user: { userId: USER_ID, userType: UserType.CUSTOMER },
        validated: {
          query: {
            filename: 'a.png',
            contentType: 'image/png',
            prefix: 'profile-images',
          },
        },
      },
    } as Response;

    await runMiddleware(req, res);
    assert.equal(queried, false);
  });

  it('chat-attachments이고 프로필이 미완성이면 PROFILE_NOT_FOUND를 전달한다', async () => {
    customerProfileRepository.findCustomerProfileByUserId = async () => ({
      service: [],
    });

    const req = {} as Request;
    const res = {
      locals: {
        user: { userId: USER_ID, userType: UserType.CUSTOMER },
        validated: {
          query: {
            filename: 'a.png',
            contentType: 'image/png',
            prefix: 'chat-attachments',
          },
        },
      },
    } as Response;

    await assertRejectsWithCode(
      () => runMiddleware(req, res),
      'PROFILE_NOT_FOUND'
    );
  });

  it('chat-attachments이고 프로필이 완료되면 통과한다', async () => {
    customerProfileRepository.findCustomerProfileByUserId = async () => ({
      service: [MoveType.SMALL],
    });

    const req = {} as Request;
    const res = {
      locals: {
        user: { userId: USER_ID, userType: UserType.CUSTOMER },
        validated: {
          query: {
            filename: 'a.png',
            contentType: 'image/png',
            prefix: 'chat-attachments',
          },
        },
      },
    } as Response;

    await runMiddleware(req, res);
  });
});
