import jwt, { type SignOptions } from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';

export type AccessTokenTyp = 'access';
export type RefreshTokenTyp = 'refresh';

export interface AccessTokenPayload {
  sub: string;
  typ: AccessTokenTyp;
}

export interface RefreshTokenPayload {
  sub: string;
  typ: RefreshTokenTyp;
  jti: string;
}

const getRequiredEnv = (key: string): string => {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
};

const getAccessSignOptions = (): SignOptions => ({
  expiresIn: getRequiredEnv('JWT_ACCESS_EXPIRES_IN') as SignOptions['expiresIn'],
});

const getRefreshSignOptions = (): SignOptions => ({
  expiresIn: getRequiredEnv(
    'JWT_REFRESH_EXPIRES_IN'
  ) as SignOptions['expiresIn'],
});

// 관리자 JWT secret과 분리
export const createAccessToken = (userId: string): string => {
  const payload: AccessTokenPayload = {
    sub: userId,
    typ: 'access',
  };

  return jwt.sign(
    payload,
    getRequiredEnv('JWT_ACCESS_SECRET'),
    getAccessSignOptions()
  );
};

// 관리자 JWT secret과 분리
export const createRefreshToken = (userId: string): string => {
  const payload: RefreshTokenPayload = {
    sub: userId,
    typ: 'refresh',
    jti: randomUUID(),
  };

  return jwt.sign(
    payload,
    getRequiredEnv('JWT_REFRESH_SECRET'),
    getRefreshSignOptions()
  );
};

/** JWT exp와 DB expiresAt을 맞추기 위해 사용한다. */
export const getAuthRefreshTokenExpiry = (
  refreshToken: string
): { expiresAt: Date; maxAgeMs: number } => {
  const decoded = jwt.decode(refreshToken);

  if (
    !decoded ||
    typeof decoded === 'string' ||
    typeof decoded.exp !== 'number'
  ) {
    throw new Error('Invalid refresh token expiry');
  }

  const expiresAt = new Date(decoded.exp * 1000);

  return {
    expiresAt,
    maxAgeMs: Math.max(expiresAt.getTime() - Date.now(), 0),
  };
};
