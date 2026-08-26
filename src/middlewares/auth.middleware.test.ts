import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import { UserStatus } from '@prisma/client';
import * as authRepository from '../repositories/auth.repository';
import { AppError } from '../utils/app.error';
import type { ErrorCode } from '../constants/error.codes';
import { createAccessToken } from '../utils/auth-jwt.util';
import { createAdminAccessToken } from '../utils/admin-jwt.util';
import {
  allowUserTypes,
  optionalAuth,
  requireAdmin,
  requireAuth,
  requireAuthAllowSuspended,
} from './auth.middleware';

const assertAppError =
  (code: ErrorCode) =>
  (error: unknown): boolean => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, code);
    return true;
  };

const createReq = (authorization?: string): Request =>
  ({
    get: (name: string) =>
      name.toLowerCase() === 'authorization' ? authorization : undefined,
  }) as Request;

const createRes = (): Response => ({ locals: {} }) as Response;

const runMiddleware = async (
  middleware: (
    req: Request,
    res: Response,
    next: NextFunction
  ) => unknown,
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

    Promise.resolve(middleware(req, res, next)).catch(reject);
  });
};

describe('auth.middleware', () => {
  before(() => {
    process.env.JWT_ACCESS_SECRET = 'user-access-test-secret';
    process.env.JWT_ACCESS_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_SECRET = 'user-refresh-test-secret';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    process.env.ADMIN_JWT_ACCESS_SECRET = 'admin-access-test-secret';
    process.env.ADMIN_JWT_ACCESS_EXPIRES_IN = '15m';
  });

  afterEach(() => {
    mock.restoreAll();
  });

  describe('requireAuth', () => {
    it('Bearer 토큰이 없으면 UNAUTHORIZED를 전달한다', async () => {
      const req = createReq();
      const res = createRes();

      await assert.rejects(
        () => runMiddleware(requireAuth, req, res),
        assertAppError('UNAUTHORIZED')
      );
    });

    it('유효한 토큰이면 res.locals.user를 설정한다', async () => {
      mock.method(authRepository, 'findUserStatusByUserId', async () => null);

      const token = createAccessToken('user-1', 'CUSTOMER');
      const req = createReq(`Bearer ${token}`);
      const res = createRes();

      await runMiddleware(requireAuth, req, res);

      assert.deepEqual(res.locals.user, {
        userId: 'user-1',
        userType: 'CUSTOMER',
      });
    });

    it('정지 계정이면 USER_SUSPENDED를 전달한다', async () => {
      mock.method(authRepository, 'findUserStatusByUserId', async () => ({
        status: UserStatus.SUSPENDED,
      }));

      const token = createAccessToken('user-1', 'CUSTOMER');
      const req = createReq(`Bearer ${token}`);
      const res = createRes();

      await assert.rejects(
        () => runMiddleware(requireAuth, req, res),
        assertAppError('USER_SUSPENDED')
      );
    });

    it('잘못된 토큰이면 UNAUTHORIZED를 전달한다', async () => {
      const req = createReq('Bearer not-a-token');
      const res = createRes();

      await assert.rejects(
        () => runMiddleware(requireAuth, req, res),
        assertAppError('UNAUTHORIZED')
      );
    });
  });

  describe('requireAuthAllowSuspended', () => {
    it('정지 계정도 통과하고 user를 설정한다', async () => {
      const findStatus = mock.method(
        authRepository,
        'findUserStatusByUserId',
        async () => ({ status: UserStatus.SUSPENDED })
      );

      const token = createAccessToken('user-1', 'MOVER');
      const req = createReq(`Bearer ${token}`);
      const res = createRes();

      await runMiddleware(requireAuthAllowSuspended, req, res);

      assert.deepEqual(res.locals.user, {
        userId: 'user-1',
        userType: 'MOVER',
      });
      assert.equal(findStatus.mock.callCount(), 0);
    });
  });

  describe('optionalAuth', () => {
    it('토큰이 없으면 비로그인으로 통과한다', async () => {
      const req = createReq();
      const res = createRes();

      await runMiddleware(optionalAuth, req, res);

      assert.equal(res.locals.user, undefined);
    });

    it('잘못된 토큰이어도 401을 내지 않고 비로그인으로 통과한다', async () => {
      const req = createReq('Bearer expired-or-forged');
      const res = createRes();

      await runMiddleware(optionalAuth, req, res);

      assert.equal(res.locals.user, undefined);
    });

    it('유효한 토큰이면 res.locals.user를 설정한다', async () => {
      const token = createAccessToken('user-2', 'MOVER');
      const req = createReq(`Bearer ${token}`);
      const res = createRes();

      await runMiddleware(optionalAuth, req, res);

      assert.deepEqual(res.locals.user, {
        userId: 'user-2',
        userType: 'MOVER',
      });
    });
  });

  describe('allowUserTypes', () => {
    it('허용되지 않은 userType이면 USER_TYPE_FORBIDDEN을 전달한다', async () => {
      const req = createReq();
      const res = createRes();
      res.locals.user = { userId: 'user-1', userType: 'CUSTOMER' };

      await assert.rejects(
        () => runMiddleware(allowUserTypes('MOVER'), req, res),
        assertAppError('USER_TYPE_FORBIDDEN')
      );
    });

    it('허용된 userType이면 통과한다', async () => {
      const req = createReq();
      const res = createRes();
      res.locals.user = { userId: 'user-1', userType: 'MOVER' };

      await runMiddleware(allowUserTypes('CUSTOMER', 'MOVER'), req, res);
    });

    it('user가 없으면 UNAUTHORIZED를 전달한다', async () => {
      const req = createReq();
      const res = createRes();

      await assert.rejects(
        () => runMiddleware(allowUserTypes('CUSTOMER'), req, res),
        assertAppError('UNAUTHORIZED')
      );
    });
  });

  describe('requireAdmin', () => {
    it('관리자 토큰이 없으면 ADMIN_UNAUTHORIZED를 전달한다', async () => {
      const req = createReq();
      const res = createRes();

      await assert.rejects(
        () => runMiddleware(requireAdmin, req, res),
        assertAppError('ADMIN_UNAUTHORIZED')
      );
    });

    it('유저 Access Token은 ADMIN_UNAUTHORIZED로 거부한다', async () => {
      const token = createAccessToken('user-1', 'CUSTOMER');
      const req = createReq(`Bearer ${token}`);
      const res = createRes();

      await assert.rejects(
        () => runMiddleware(requireAdmin, req, res),
        assertAppError('ADMIN_UNAUTHORIZED')
      );
    });

    it('유효한 관리자 토큰이면 res.locals.admin을 설정한다', async () => {
      const token = createAdminAccessToken(7);
      const req = createReq(`Bearer ${token}`);
      const res = createRes();

      await runMiddleware(requireAdmin, req, res);

      assert.deepEqual(res.locals.admin, {
        adminId: 7,
        role: 'ADMIN',
      });
    });
  });
});
