import { createHash } from 'crypto';

/** Refresh Token 원문은 DB에 저장하지 않고 SHA-256 해시만 보관하기 위함. */
export const hashAdminRefreshToken = (refreshToken: string): string => {
  return createHash('sha256').update(refreshToken).digest('hex');
};
