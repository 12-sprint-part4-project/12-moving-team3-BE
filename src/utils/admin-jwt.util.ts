import jwt, { type SignOptions } from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';

export type AdminAccessTokenTyp = 'admin_access';
export type AdminRefreshTokenTyp = 'admin_refresh';

export interface AdminAccessTokenPayload {
  sub: number;
  typ: AdminAccessTokenTyp;
}

export interface AdminRefreshTokenPayload {
  sub: number;
  typ: AdminRefreshTokenTyp;
  jti: string;
}

const getRequiredEnv = (key: string): string => {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
};

const getAdminAccessSignOptions = (): SignOptions => ({
  expiresIn: getRequiredEnv(
    'ADMIN_JWT_ACCESS_EXPIRES_IN'
  ) as SignOptions['expiresIn'],
});

const getAdminRefreshSignOptions = (): SignOptions => ({
  expiresIn: getRequiredEnv(
    'ADMIN_JWT_REFRESH_EXPIRES_IN'
  ) as SignOptions['expiresIn'],
});

// 일반 유저 JWT secret과 분리
export const createAdminAccessToken = (adminId: number): string => {
  const payload: AdminAccessTokenPayload = {
    sub: adminId,
    typ: 'admin_access',
  };

  return jwt.sign(
    payload,
    getRequiredEnv('ADMIN_JWT_ACCESS_SECRET'),
    getAdminAccessSignOptions()
  );
};

// 일반 유저 JWT secret과 분리
export const createAdminRefreshToken = (adminId: number): string => {
  const payload: AdminRefreshTokenPayload = {
    sub: adminId,
    typ: 'admin_refresh',
    jti: randomUUID(),
  };

  return jwt.sign(
    payload,
    getRequiredEnv('ADMIN_JWT_REFRESH_SECRET'),
    getAdminRefreshSignOptions()
  );
};

/** JWT exp와 Cookie maxAge / DB expiresAt을 맞추기 위해 사용한다. */
export const getAdminRefreshTokenExpiry = (
  refreshToken: string
): { expiresAt: Date; maxAgeMs: number } => {
  const decoded = jwt.decode(refreshToken);

  if (
    !decoded ||
    typeof decoded === 'string' ||
    typeof decoded.exp !== 'number'
  ) {
    throw new Error('Invalid admin refresh token expiry');
  }

  const expiresAt = new Date(decoded.exp * 1000);

  return {
    expiresAt,
    maxAgeMs: Math.max(expiresAt.getTime() - Date.now(), 0),
  };
};
