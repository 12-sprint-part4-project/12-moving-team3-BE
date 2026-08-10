import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import type { Request, Response } from 'express';
import * as adminAuthService from '../services/admin-auth.service';
import * as adminCookieUtil from '../utils/admin-cookie.util';
import { refreshAdminToken } from './admin-auth.controller';

describe('admin-auth.controller refreshAdminToken', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('재발급 성공 시 accessToken만 응답하고 Set-Cookie를 호출하지 않는다', async () => {
    const refreshMock = mock.method(
      adminAuthService,
      'refreshAdminToken',
      async () => ({ accessToken: 'new-access-token' })
    );
    const setCookieMock = mock.method(
      adminCookieUtil,
      'setAdminRefreshTokenCookie',
      () => {
        throw new Error('refresh must not set a new refresh cookie');
      }
    );

    let statusCode = 0;
    let body: unknown;
    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(payload: unknown) {
        body = payload;
        return this;
      },
    } as Response;
    const req = {
      cookies: {
        [adminCookieUtil.ADMIN_REFRESH_TOKEN_COOKIE_NAME]: 'refresh-cookie',
      },
    } as unknown as Request;

    await refreshAdminToken(req, res);

    assert.equal(statusCode, 200);
    assert.deepEqual(body, {
      data: {
        accessToken: 'new-access-token',
      },
    });
    assert.equal(refreshMock.mock.callCount(), 1);
    assert.equal(setCookieMock.mock.callCount(), 0);
  });
});
