import jwt, { type SignOptions } from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { parseAdminTokenSub, toAdminTokenSub } from './auth-role.util';

export type AdminAccessTokenTyp = 'access';
export type AdminRefreshTokenTyp = 'refresh';

export interface AdminAccessTokenPayload {
  sub: number;
  typ: AdminAccessTokenTyp;
  role: 'ADMIN';
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

const isLegacyAdminAccessToken = (payload: Record<string, unknown>): boolean =>
  payload.typ === 'admin_access';

const isLegacyAdminRefreshToken = (payload: Record<string, unknown>): boolean =>
  payload.typ === 'admin_refresh';

// 일반 유저 JWT secret과 분리
export const createAdminAccessToken = (adminId: number): string => {
  const payload = {
    sub: toAdminTokenSub(adminId),
    typ: 'access' as const,
    role: 'ADMIN' as const,
  };

  return jwt.sign(
    payload,
    getRequiredEnv('ADMIN_JWT_ACCESS_SECRET'),
    getAdminAccessSignOptions()
  );
};

const toAdminAccessTokenPayload = (
  payload: Record<string, unknown>
): AdminAccessTokenPayload | null => {
  const adminId = parseAdminTokenSub(payload.sub);

  if (adminId == null) {
    return null;
  }

  if (payload.typ === 'access' && payload.role === 'ADMIN') {
    return {
      sub: adminId,
      typ: 'access',
      role: 'ADMIN',
    };
  }

  if (isLegacyAdminAccessToken(payload)) {
    return {
      sub: adminId,
      typ: 'access',
      role: 'ADMIN',
    };
  }

  return null;
};

export const verifyAdminAccessToken = (
  accessToken: string
): AdminAccessTokenPayload => {
  const decoded = jwt.verify(
    accessToken,
    getRequiredEnv('ADMIN_JWT_ACCESS_SECRET'),
    {
      algorithms: ['HS256'],
    }
  );

  if (!decoded || typeof decoded !== 'object') {
    throw new jwt.JsonWebTokenError('Invalid admin access token payload');
  }

  const payload = toAdminAccessTokenPayload(decoded as Record<string, unknown>);

  if (!payload) {
    throw new jwt.JsonWebTokenError('Invalid admin access token payload');
  }

  return payload;
};

const toAdminRefreshTokenPayload = (
  payload: Record<string, unknown>
): AdminRefreshTokenPayload | null => {
  const adminId = parseAdminTokenSub(payload.sub);

  if (adminId == null) {
    return null;
  }

  if (typeof payload.jti !== 'string' || payload.jti.length === 0) {
    return null;
  }

  if (payload.typ === 'refresh' || isLegacyAdminRefreshToken(payload)) {
    return {
      sub: adminId,
      typ: 'refresh',
      jti: payload.jti,
    };
  }

  return null;
};

export const verifyAdminRefreshToken = (
  refreshToken: string
): AdminRefreshTokenPayload => {
  const decoded = jwt.verify(
    refreshToken,
    getRequiredEnv('ADMIN_JWT_REFRESH_SECRET'),
    {
      algorithms: ['HS256'],
    }
  );

  if (!decoded || typeof decoded !== 'object') {
    throw new jwt.JsonWebTokenError('Invalid admin refresh token payload');
  }

  const payload = toAdminRefreshTokenPayload(
    decoded as Record<string, unknown>
  );

  if (!payload) {
    throw new jwt.JsonWebTokenError('Invalid admin refresh token payload');
  }

  return payload;
};

// 일반 유저 JWT secret과 분리
export const createAdminRefreshToken = (adminId: number): string => {
  const payload = {
    sub: toAdminTokenSub(adminId),
    typ: 'refresh' as const,
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
