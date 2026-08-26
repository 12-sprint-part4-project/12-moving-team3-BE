import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import * as s3Service from '../services/s3.service';
import { getPresignedUploadUrl } from './presigned-url.controller';

describe('presigned-url.controller', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('인증된 사용자에게 uploadUrl과 s3Key를 반환한다', async () => {
    const createMock = mock.method(
      s3Service,
      'createPresignedUploadUrl',
      async () => ({
        uploadUrl: 'https://s3.example/upload',
        s3Key: 'profile-images/uuid_photo.png',
      })
    );

    let statusCode = 0;
    let body: unknown;
    const res = {
      locals: {
        user: { userId: 'user-1', userType: 'CUSTOMER' },
        validated: {
          query: {
            filename: 'photo.png',
            contentType: 'image/png',
            prefix: 'profile-images',
          },
        },
      },
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(payload: unknown) {
        body = payload;
        return this;
      },
    } as Response;

    await getPresignedUploadUrl({} as Request, res, (() => undefined) as NextFunction);

    assert.equal(statusCode, 200);
    assert.deepEqual(body, {
      data: {
        uploadUrl: 'https://s3.example/upload',
        s3Key: 'profile-images/uuid_photo.png',
      },
    });
    assert.equal(createMock.mock.callCount(), 1);
    assert.deepEqual(createMock.mock.calls[0].arguments, [
      'photo.png',
      'image/png',
      'profile-images',
    ]);
  });

  it('인증 정보가 없으면 next로 에러를 넘긴다', async () => {
    let passedError: unknown;
    const res = {
      locals: {
        validated: {
          query: {
            filename: 'photo.png',
            contentType: 'image/png',
            prefix: 'profile-images',
          },
        },
      },
    } as Response;

    await getPresignedUploadUrl({} as Request, res, ((error?: unknown) => {
      passedError = error;
    }) as NextFunction);

    assert.ok(passedError instanceof Error);
  });
});
