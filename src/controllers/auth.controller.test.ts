import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import type { Request, Response } from 'express';
import * as authService from '../services/auth.service';
import * as cookieUtil from '../utils/cookie.util';
import { refreshAuthToken, signup } from './auth.controller';

describe('auth.controller', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('재발급 성공 시 accessToken을 응답하고 Refresh Token 쿠키를 갱신한다', async () => {
    const refreshMock = mock.method(authService, 'refreshAuthToken', async () => ({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      refreshTokenMaxAgeMs: 1000,
    }));
    const setCookieMock = mock.method(
      cookieUtil,
      'setAuthRefreshTokenCookie',
      () => undefined
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
        [cookieUtil.AUTH_REFRESH_TOKEN_COOKIE_NAME]: 'refresh-cookie',
      },
    } as unknown as Request;

    await refreshAuthToken(req, res);

    assert.equal(statusCode, 200);
    assert.deepEqual(body, {
      data: {
        accessToken: 'new-access-token',
      },
    });
    assert.equal(refreshMock.mock.callCount(), 1);
    assert.equal(setCookieMock.mock.callCount(), 1);
    assert.deepEqual(setCookieMock.mock.calls[0].arguments, [
      res,
      'new-refresh-token',
      1000,
    ]);
  });

  it('회원가입 성공 시 201과 user만 반환하고 쿠키를 설정하지 않는다', async () => {
    mock.method(authService, 'signup', async () => ({
      user: {
        id: 'user-1',
        userType: 'CUSTOMER',
        name: '홍길동',
        nickname: '길동',
        email: 'user@example.com',
        phoneNumber: '',
        isProfileCompleted: false,
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    }));
    const setCookieMock = mock.method(
      cookieUtil,
      'setAuthRefreshTokenCookie',
      () => {
        throw new Error('signup must not set a refresh cookie');
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
      body: {
        userType: 'CUSTOMER',
        name: '홍길동',
        nickname: '길동',
        email: 'user@example.com',
        password: 'ValidPass1!',
        passwordConfirmation: 'ValidPass1!',
      },
    } as Request;

    await signup(req, res);

    assert.equal(statusCode, 201);
    assert.equal(
      (body as { data: { user: { id: string } } }).data.user.id,
      'user-1'
    );
    assert.equal(setCookieMock.mock.callCount(), 0);
  });
});
