import type { CookieOptions, Response } from 'express';
import env from '../config/env';

export const AUTH_REFRESH_TOKEN_COOKIE_NAME = 'refreshToken';

export const AUTH_REFRESH_TOKEN_COOKIE_OPTIONS = {
  httpOnly: true, // XSS로 스크립트에서 토큰 읽기 방지
  secure: env.nodeEnv === 'production',
  sameSite: 'none',
  path: '/api/auth', // 일반 유저 인증 경로에만 자동 전송
} satisfies CookieOptions;

export const setAuthRefreshTokenCookie = (
  res: Response,
  refreshToken: string,
  maxAgeMs: number
): void => {
  res.cookie(AUTH_REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
    ...AUTH_REFRESH_TOKEN_COOKIE_OPTIONS,
    maxAge: maxAgeMs,
  });
};

/** set과 동일한 path·옵션으로 지워야 브라우저가 쿠키를 실제로 제거한다. */
export const clearAuthRefreshTokenCookie = (res: Response): void => {
  res.clearCookie(
    AUTH_REFRESH_TOKEN_COOKIE_NAME,
    AUTH_REFRESH_TOKEN_COOKIE_OPTIONS
  );
};
