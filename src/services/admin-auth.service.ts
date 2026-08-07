import type { DeviceType } from '@prisma/client';
import { JsonWebTokenError } from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import * as adminAuthRepository from '../repositories/admin-auth.repository';
import { AppError } from '../utils/app.error';
import {
  createAdminAccessToken,
  createAdminRefreshToken,
  getAdminRefreshTokenExpiry,
  verifyAdminRefreshToken,
  type AdminRefreshTokenPayload,
} from '../utils/admin-jwt.util';
import {
  ADMIN_PASSWORD_DUMMY_HASH,
  compareAdminPassword,
} from '../utils/admin-password.util';
import { hashAdminRefreshToken } from '../utils/admin-token-hash.util';

export interface AdminLoginServiceInput {
  email: string;
  password: string;
  device: DeviceType;
}

export interface AdminLoginServiceResult {
  accessToken: string;
  refreshToken: string;
  refreshTokenMaxAgeMs: number;
  admin: {
    id: number;
    email: string;
    name: string;
  };
}

export const loginAdmin = async (
  input: AdminLoginServiceInput
): Promise<AdminLoginServiceResult> => {
  const admin = await adminAuthRepository.findAdminByEmail(input.email);

  // 계정 존재 여부를 응답/시간으로 구분하지 않기 위함
  const isPasswordMatched = await compareAdminPassword(
    input.password,
    admin?.passwordHash ?? ADMIN_PASSWORD_DUMMY_HASH
  );

  if (!admin || !isPasswordMatched) {
    throw new AppError('ADMIN_INVALID_CREDENTIALS');
  }

  const accessToken = createAdminAccessToken(admin.id);
  const refreshToken = createAdminRefreshToken(admin.id);
  const { expiresAt, maxAgeMs } = getAdminRefreshTokenExpiry(refreshToken);

  // 원문 대신 해시만 저장해 DB 유출 시에도 토큰 재사용을 어렵게 한다
  await adminAuthRepository.createAdminRefreshTokenRecord({
    adminId: admin.id,
    tokenHash: hashAdminRefreshToken(refreshToken),
    device: input.device,
    expiresAt,
  });

  return {
    accessToken,
    refreshToken,
    refreshTokenMaxAgeMs: maxAgeMs,
    admin: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
    },
  };
};

export interface AdminMeServiceResult {
  id: number;
  email: string;
  name: string;
}

export const getAdminMe = async (
  adminId: number
): Promise<AdminMeServiceResult> => {
  const admin = await adminAuthRepository.findAdminById(adminId);

  // 토큰은 유효해도 계정이 없으면 인증된 관리자로 취급하지 않는다.
  if (!admin) {
    throw new AppError('ADMIN_UNAUTHORIZED');
  }

  return admin;
};

export interface AdminRefreshTokenRecord {
  id: number;
  adminId: number;
  tokenHash: string;
  device: DeviceType;
  expiresAt: Date;
}

export interface ValidateAdminRefreshTokenResult {
  admin: {
    id: number;
    email: string;
    name: string;
  };
  refreshTokenRecord: AdminRefreshTokenRecord;
  payload: AdminRefreshTokenPayload;
}

/**
 * 쿠키 Refresh Token의 JWT·DB 유효성만 검증한다.
 * Access/Refresh 재발급·Rotation·쿠키 갱신은 호출측(이후 커밋) 책임이다.
 */
export const validateAdminRefreshToken = async (
  refreshToken: string | undefined
): Promise<ValidateAdminRefreshTokenResult> => {
  // 쿠키 누락과 JWT/DB 실패를 같은 401로 통일해 원인 추측을 어렵게 한다.
  if (!refreshToken) {
    throw new AppError('ADMIN_UNAUTHORIZED');
  }

  let payload: AdminRefreshTokenPayload;

  try {
    // 서명·만료·typ·sub·jti를 Access 검증과 분리된 Refresh 전용 경로로 확인한다.
    payload = verifyAdminRefreshToken(refreshToken);
  } catch (error) {
    // 환경변수 누락 등 서버 오류는 그대로 넘겨 500 처리한다.
    if (error instanceof JsonWebTokenError) {
      throw new AppError('ADMIN_UNAUTHORIZED');
    }

    throw error;
  }

  const tokenHash = hashAdminRefreshToken(refreshToken);
  const refreshTokenRecord =
    await adminAuthRepository.findAdminRefreshTokenByHash(tokenHash);

  // 폐기·위조·미저장 토큰은 JWT만 맞아도 세션으로 인정하지 않는다.
  if (!refreshTokenRecord) {
    throw new AppError('ADMIN_UNAUTHORIZED');
  }

  // JWT exp와 별도로 DB expiresAt을 검사해 서버측 만료 정책을 강제한다.
  if (refreshTokenRecord.expiresAt.getTime() <= Date.now()) {
    throw new AppError('ADMIN_UNAUTHORIZED');
  }

  // 다른 관리자 토큰을 훔쳐 붙이는 식의 클레임·레코드 불일치를 막는다.
  if (payload.sub !== refreshTokenRecord.adminId) {
    throw new AppError('ADMIN_UNAUTHORIZED');
  }

  const admin = await adminAuthRepository.findAdminById(
    refreshTokenRecord.adminId
  );

  // 토큰은 남아 있어도 삭제된 계정으로는 재발급하지 않는다.
  if (!admin) {
    throw new AppError('ADMIN_UNAUTHORIZED');
  }

  return {
    admin,
    refreshTokenRecord,
    payload,
  };
};

export interface RefreshAdminTokenResult {
  accessToken: string;
  refreshToken: string;
  refreshTokenMaxAgeMs: number;
}

/**
 * 검증된 Refresh Token을 Rotation한다.
 * 기존 레코드 삭제와 신규 저장은 트랜잭션으로 묶어 불완전 상태를 남기지 않는다.
 */
export const refreshAdminToken = async (
  refreshToken: string | undefined
): Promise<RefreshAdminTokenResult> => {
  const { admin, refreshTokenRecord } =
    await validateAdminRefreshToken(refreshToken);

  const accessToken = createAdminAccessToken(admin.id);
  const nextRefreshToken = createAdminRefreshToken(admin.id);
  const { expiresAt, maxAgeMs } = getAdminRefreshTokenExpiry(nextRefreshToken);
  const nextTokenHash = hashAdminRefreshToken(nextRefreshToken);

  await prisma.$transaction(async (tx) => {
    // 검증된 레코드만 삭제해 동일 관리자의 다른 세션 토큰은 유지한다.
    const { count } = await adminAuthRepository.deleteAdminRefreshTokenById(
      refreshTokenRecord.id,
      admin.id,
      tx
    );

    // 동시 Rotation 등으로 이미 삭제된 토큰이면 재발급하지 않는다.
    if (count === 0) {
      throw new AppError('ADMIN_UNAUTHORIZED');
    }

    await adminAuthRepository.createAdminRefreshTokenRecord(
      {
        adminId: admin.id,
        tokenHash: nextTokenHash,
        // 같은 세션의 device를 유지해 Rotation만으로 기기 정보가 바뀌지 않게 한다.
        device: refreshTokenRecord.device,
        expiresAt,
      },
      tx
    );
  });

  return {
    accessToken,
    refreshToken: nextRefreshToken,
    refreshTokenMaxAgeMs: maxAgeMs,
  };
};

/**
 * Refresh Cookie 기준 세션만 정리한다.
 * JWT 검증·계정 조회 없이 해시 삭제를 시도해 멱등 로그아웃을 보장한다.
 */
export const logoutAdmin = async (
  refreshToken: string | undefined
): Promise<void> => {
  // 쿠키가 없으면 DB에 지울 대상이 없으므로 조회·삭제 없이 종료한다.
  if (!refreshToken) {
    return;
  }

  // 만료·위조 JWT여도 동일 문자열 해시로 DB에 남은 레코드를 제거할 수 있다.
  const tokenHash = hashAdminRefreshToken(refreshToken);
  await adminAuthRepository.deleteAdminRefreshTokenByHash(tokenHash);
};
