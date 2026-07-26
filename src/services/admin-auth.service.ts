import type { DeviceType } from '@prisma/client';
import * as adminAuthRepository from '../repositories/admin-auth.repository';
import { AppError } from '../utils/app.error';
import {
  createAdminAccessToken,
  createAdminRefreshToken,
  getAdminRefreshTokenExpiry,
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

export const login = async (
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
