import type { Response } from 'express';

export const ADMIN_REFRESH_TOKEN_COOKIE_NAME = 'adminRefreshToken';

const adminRefreshTokenCookieOptions = {
  httpOnly: true, // XSS로 스크립트에서 토큰 읽기 방지
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/api/admin/auth', // 관리자 인증 경로에만 자동 전송
};

export const setAdminRefreshTokenCookie = (
  res: Response,
  refreshToken: string,
  maxAgeMs: number
): void => {
  res.cookie(ADMIN_REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
    ...adminRefreshTokenCookieOptions,
    maxAge: maxAgeMs,
  });
};

/** set과 동일한 path·옵션으로 지워야 브라우저가 쿠키를 실제로 제거한다. */
export const clearAdminRefreshTokenCookie = (res: Response): void => {
  res.clearCookie(
    ADMIN_REFRESH_TOKEN_COOKIE_NAME,
    adminRefreshTokenCookieOptions
  );
};
