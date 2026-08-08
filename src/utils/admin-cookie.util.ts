import type { CookieOptions, Response } from 'express';
import env from '../config/env';

export const ADMIN_REFRESH_TOKEN_COOKIE_NAME = 'adminRefreshToken';

export const ADMIN_REFRESH_TOKEN_COOKIE_OPTIONS = {
  httpOnly: true, // XSS로 스크립트에서 토큰 읽기 방지
  secure: env.nodeEnv === 'production',
  sameSite: 'none',
  path: '/api/admin/auth', // 관리자 인증 경로에만 자동 전송
} satisfies CookieOptions;

export const setAdminRefreshTokenCookie = (
  res: Response,
  refreshToken: string,
  maxAgeMs: number
): void => {
  res.cookie(ADMIN_REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
    ...ADMIN_REFRESH_TOKEN_COOKIE_OPTIONS,
    maxAge: maxAgeMs,
  });
};

/** set과 동일한 path·옵션으로 지워야 브라우저가 쿠키를 실제로 제거한다. */
export const clearAdminRefreshTokenCookie = (res: Response): void => {
  res.clearCookie(
    ADMIN_REFRESH_TOKEN_COOKIE_NAME,
    ADMIN_REFRESH_TOKEN_COOKIE_OPTIONS
  );
};
