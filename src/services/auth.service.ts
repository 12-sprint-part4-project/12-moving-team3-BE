import { UserType, type DeviceType } from '@prisma/client';
import * as authRepository from '../repositories/auth.repository';
import type { ApiUserType, LoginBody, SignupBody } from '../schemas/auth.schema';
import { AppError } from '../utils/app.error';
import {
  createAccessToken,
  createRefreshToken,
  getAuthRefreshTokenExpiry,
} from '../utils/auth-jwt.util';
import {
  AUTH_PASSWORD_DUMMY_HASH,
  compareAuthPassword,
  hashAuthPassword,
} from '../utils/auth-password.util';
import { hashAuthRefreshToken } from '../utils/auth-token-hash.util';
import { toAppErrorFromPrisma } from '../utils/prisma-error.util';

export interface SignupServiceInput extends SignupBody {
  device: DeviceType;
}

export interface LoginServiceInput extends LoginBody {
  device: DeviceType;
}

export interface SignupServiceResult {
  user: {
    id: string;
    userType: ApiUserType;
    name: string;
    nickname: string;
    email: string;
    phoneNumber: string;
    isProfileCompleted: boolean;
    createdAt: Date;
  };
  accessToken: string;
  refreshToken: string;
}

export interface LoginServiceResult {
  user: {
    id: string;
    userType: ApiUserType;
    email: string;
    phoneNumber: string;
    isProfileCompleted: boolean;
  };
  accessToken: string;
  refreshToken: string;
  refreshTokenMaxAgeMs: number;
}

const toPrismaUserType = (userType: ApiUserType): UserType => {
  return userType === 'DRIVER' ? UserType.MOVER : UserType.CUSTOMER;
};

const toApiUserType = (userType: UserType): ApiUserType => {
  return userType === UserType.MOVER ? 'DRIVER' : 'CUSTOMER';
};

export const login = async (
  input: LoginServiceInput
): Promise<LoginServiceResult> => {
  const user = await authRepository.findUserWithLocalAuthByEmail(input.email);
  const localAuth = user?.authAccounts[0];

  // 계정 존재 여부를 응답/시간으로 구분하지 않기 위함
  const isPasswordMatched = await compareAuthPassword(
    input.password,
    localAuth?.passwordHash ?? AUTH_PASSWORD_DUMMY_HASH
  );

  if (!user) {
    throw new AppError('INVALID_CREDENTIALS');
  }

  const apiUserType = toApiUserType(user.userType);

  if (apiUserType !== input.userType) {
    throw new AppError('USER_TYPE_MISMATCH');
  }

  if (!localAuth?.passwordHash || !isPasswordMatched) {
    throw new AppError('INVALID_CREDENTIALS');
  }

  const accessToken = createAccessToken(user.id, apiUserType);
  const refreshToken = createRefreshToken(user.id);
  const { expiresAt, maxAgeMs } = getAuthRefreshTokenExpiry(refreshToken);

  // 사용자당 한 개 정책 — 기존 Refresh Token을 교체한다
  await authRepository.deleteRefreshTokensByUserId(user.id);

  // 원문 대신 해시만 저장해 DB 유출 시에도 토큰 재사용을 어렵게 한다
  await authRepository.createRefreshTokenRecord({
    userId: user.id,
    tokenHash: hashAuthRefreshToken(refreshToken),
    device: input.device,
    expiresAt,
  });

  return {
    user: {
      id: user.id,
      userType: apiUserType,
      email: user.email,
      phoneNumber: user.phoneNumber ?? '',
      isProfileCompleted: Boolean(user.customerProfile || user.moverProfile),
    },
    accessToken,
    refreshToken,
    refreshTokenMaxAgeMs: maxAgeMs,
  };
};

export const signup = async (
  input: SignupServiceInput
): Promise<SignupServiceResult> => {
  const existingEmail = await authRepository.findUserByEmail(input.email);

  if (existingEmail) {
    throw new AppError('EMAIL_ALREADY_EXISTS');
  }

  const existingNickname = await authRepository.findUserByNickname(
    input.nickname
  );

  if (existingNickname) {
    throw new AppError('NICKNAME_ALREADY_EXISTS');
  }

  const existingPhoneNumber = await authRepository.findUserByPhoneNumber(
    input.phoneNumber
  );

  if (existingPhoneNumber) {
    throw new AppError('PHONE_NUMBER_ALREADY_EXISTS');
  }

  const passwordHash = await hashAuthPassword(input.password);

  try {
    const user = await authRepository.createUserWithLocalAuth({
      name: input.name,
      nickname: input.nickname,
      email: input.email,
      phoneNumber: input.phoneNumber,
      userType: toPrismaUserType(input.userType),
      passwordHash,
    });

    const accessToken = createAccessToken(user.id, toApiUserType(user.userType));
    const refreshToken = createRefreshToken(user.id);
    const { expiresAt } = getAuthRefreshTokenExpiry(refreshToken);

    // 원문 대신 해시만 저장해 DB 유출 시에도 토큰 재사용을 어렵게 한다
    await authRepository.createRefreshTokenRecord({
      userId: user.id,
      tokenHash: hashAuthRefreshToken(refreshToken),
      device: input.device,
      expiresAt,
    });

    return {
      user: {
        id: user.id,
        userType: toApiUserType(user.userType),
        name: user.name,
        nickname: user.nickname,
        email: user.email,
        phoneNumber: user.phoneNumber ?? input.phoneNumber,
        isProfileCompleted: Boolean(user.customerProfile || user.moverProfile),
        createdAt: user.createdAt,
      },
      accessToken,
      refreshToken,
    };
  } catch (error) {
    const appError = toAppErrorFromPrisma(error);

    if (appError) {
      throw appError;
    }

    throw error;
  }
};
