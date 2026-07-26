import jwt, { type SignOptions } from 'jsonwebtoken';

export type AdminAccessTokenTyp = 'admin_access';
export type AdminRefreshTokenTyp = 'admin_refresh';

export interface AdminAccessTokenPayload {
  sub: number;
  typ: AdminAccessTokenTyp;
}

export interface AdminRefreshTokenPayload {
  sub: number;
  typ: AdminRefreshTokenTyp;
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
    'ADMIN_JWT_ACCESS_EXPIRES_IN',
  ) as SignOptions['expiresIn'],
});

const getAdminRefreshSignOptions = (): SignOptions => ({
  expiresIn: getRequiredEnv(
    'ADMIN_JWT_REFRESH_EXPIRES_IN',
  ) as SignOptions['expiresIn'],
});

/** 관리자 Access Token을 발급한다. (일반 유저 JWT secret과 분리) */
export const createAdminAccessToken = (adminId: number): string => {
  const payload: AdminAccessTokenPayload = {
    sub: adminId,
    typ: 'admin_access',
  };

  return jwt.sign(
    payload,
    getRequiredEnv('ADMIN_JWT_ACCESS_SECRET'),
    getAdminAccessSignOptions(),
  );
};

/** 관리자 Refresh Token을 발급한다. (일반 유저 JWT secret과 분리) */
export const createAdminRefreshToken = (adminId: number): string => {
  const payload: AdminRefreshTokenPayload = {
    sub: adminId,
    typ: 'admin_refresh',
  };

  return jwt.sign(
    payload,
    getRequiredEnv('ADMIN_JWT_REFRESH_SECRET'),
    getAdminRefreshSignOptions(),
  );
};
