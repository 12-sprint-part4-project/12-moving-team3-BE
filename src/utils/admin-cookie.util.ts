import type { Response } from 'express';

export const ADMIN_REFRESH_TOKEN_COOKIE_NAME = 'adminRefreshToken';

export const setAdminRefreshTokenCookie = (
  res: Response,
  refreshToken: string,
  maxAgeMs: number
): void => {
  res.cookie(ADMIN_REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
    httpOnly: true, // XSS로 스크립트에서 토큰 읽기 방지
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/admin/auth', // 관리자 인증 경로에만 자동 전송
    maxAge: maxAgeMs,
  });
};
