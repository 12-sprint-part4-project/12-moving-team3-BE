import type { CookieOptions, Response } from 'express';
import env from '../config/env';

export const AUTH_REFRESH_TOKEN_COOKIE_NAME = 'refreshToken';
const AUTH_REFRESH_TOKEN_COOKIE_PATH = '/api/auth';

export const ADMIN_REFRESH_TOKEN_COOKIE_NAME = 'adminRefreshToken';
const ADMIN_REFRESH_TOKEN_COOKIE_PATH = '/api/admin/auth';

const createRefreshTokenCookieOptions = (path: string): CookieOptions =>
  ({
    httpOnly: true, // XSS로 스크립트에서 토큰 읽기 방지
    secure: env.nodeEnv === 'production',
    sameSite: env.nodeEnv === 'production' ? 'none' : 'lax',
    path,
  }) satisfies CookieOptions;

const setRefreshTokenCookie = (
  res: Response,
  cookieName: string,
  path: string,
  refreshToken: string,
  maxAgeMs: number
): void => {
  res.cookie(cookieName, refreshToken, {
    ...createRefreshTokenCookieOptions(path),
    maxAge: maxAgeMs,
  });
};

/** set과 동일한 path·옵션으로 지워야 브라우저가 쿠키를 실제로 제거한다. */
const clearRefreshTokenCookie = (
  res: Response,
  cookieName: string,
  path: string
): void => {
  res.clearCookie(cookieName, createRefreshTokenCookieOptions(path));
};

export const setAuthRefreshTokenCookie = (
  res: Response,
  refreshToken: string,
  maxAgeMs: number
): void => {
  setRefreshTokenCookie(
    res,
    AUTH_REFRESH_TOKEN_COOKIE_NAME,
    AUTH_REFRESH_TOKEN_COOKIE_PATH,
    refreshToken,
    maxAgeMs
  );
};

export const clearAuthRefreshTokenCookie = (res: Response): void => {
  clearRefreshTokenCookie(
    res,
    AUTH_REFRESH_TOKEN_COOKIE_NAME,
    AUTH_REFRESH_TOKEN_COOKIE_PATH
  );
};

export const setAdminRefreshTokenCookie = (
  res: Response,
  refreshToken: string,
  maxAgeMs: number
): void => {
  setRefreshTokenCookie(
    res,
    ADMIN_REFRESH_TOKEN_COOKIE_NAME,
    ADMIN_REFRESH_TOKEN_COOKIE_PATH,
    refreshToken,
    maxAgeMs
  );
};

export const clearAdminRefreshTokenCookie = (res: Response): void => {
  clearRefreshTokenCookie(
    res,
    ADMIN_REFRESH_TOKEN_COOKIE_NAME,
    ADMIN_REFRESH_TOKEN_COOKIE_PATH
  );
};
