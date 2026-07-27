import type { Response } from 'express';

export const AUTH_REFRESH_TOKEN_COOKIE_NAME = 'refreshToken';

export const setAuthRefreshTokenCookie = (
  res: Response,
  refreshToken: string,
  maxAgeMs: number
): void => {
  res.cookie(AUTH_REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: maxAgeMs,
  });
};
