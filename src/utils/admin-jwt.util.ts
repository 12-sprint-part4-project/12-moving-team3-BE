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

// jwt.verify는 서명·만료만 보장하므로, 클레임 형태는 별도 가드로 좁힌다.
const isAdminAccessTokenPayload = (
  payload: unknown
): payload is AdminAccessTokenPayload => {
  // null·문자열·배열 등은 AdminAccessTokenPayload로 취급하면 안 된다.
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const candidate = payload as Record<string, unknown>;

  return (
    // AdminUser.id는 양의 정수라서 소수·NaN·Infinity·0 이하는 adminId로 쓸 수 없다.
    typeof candidate.sub === 'number' &&
    Number.isSafeInteger(candidate.sub) &&
    candidate.sub > 0 &&
    // Refresh Token(admin_refresh)이나 다른 용도 JWT가 Access로 오용되는 것을 막는다.
    candidate.typ === 'admin_access'
  );
};

export const verifyAdminAccessToken = (
  accessToken: string
): AdminAccessTokenPayload => {
  // 관리자 전용 secret으로 서명 위조와 만료 토큰을 걸러낸다.
  const decoded = jwt.verify(
    accessToken,
    getRequiredEnv('ADMIN_JWT_ACCESS_SECRET'),
    {
      // none 등 약한 알고리즘 수용을 막아 알고리즘 혼동 공격을 방지한다.
      algorithms: ['HS256'],
    }
  );

  // 서명이 맞아도 payload 형태가 다르면 관리자 Access Token으로 신뢰하지 않는다.
  // JsonWebTokenError로 던져 미들웨어가 인증 실패(401)와 서버 오류(500)를 구분하게 한다.
  if (!isAdminAccessTokenPayload(decoded)) {
    throw new jwt.JsonWebTokenError('Invalid admin access token payload');
  }

  return decoded;
};

// jwt.verify는 서명·만료만 보장하므로, Refresh 클레임 형태는 별도 가드로 좁힌다.
const isAdminRefreshTokenPayload = (
  payload: unknown
): payload is AdminRefreshTokenPayload => {
  // null·문자열·배열 등은 AdminRefreshTokenPayload로 취급하면 안 된다.
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const candidate = payload as Record<string, unknown>;

  return (
    // AdminUser.id는 양의 정수라서 소수·NaN·Infinity·0 이하는 adminId로 쓸 수 없다.
    typeof candidate.sub === 'number' &&
    Number.isSafeInteger(candidate.sub) &&
    candidate.sub > 0 &&
    // Access Token(admin_access)이나 다른 용도 JWT가 Refresh로 오용되는 것을 막는다.
    candidate.typ === 'admin_refresh' &&
    // jti는 토큰 단위 폐기·재사용 탐지에 쓰이므로 없으면 Refresh로 신뢰하지 않는다.
    typeof candidate.jti === 'string' &&
    candidate.jti.length > 0
  );
};

export const verifyAdminRefreshToken = (
  refreshToken: string
): AdminRefreshTokenPayload => {
  // Access와 다른 Refresh 전용 secret으로 서명 위조와 만료 토큰을 걸러낸다.
  const decoded = jwt.verify(
    refreshToken,
    getRequiredEnv('ADMIN_JWT_REFRESH_SECRET'),
    {
      // none 등 약한 알고리즘 수용을 막아 알고리즘 혼동 공격을 방지한다.
      algorithms: ['HS256'],
    }
  );

  // 서명이 맞아도 payload 형태가 다르면 관리자 Refresh Token으로 신뢰하지 않는다.
  // JsonWebTokenError로 던져 호출측이 인증 실패(401)와 서버 오류(500)를 구분하게 한다.
  if (!isAdminRefreshTokenPayload(decoded)) {
    throw new jwt.JsonWebTokenError('Invalid admin refresh token payload');
  }

  return decoded;
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
