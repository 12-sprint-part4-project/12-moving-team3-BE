import { UserType, type DeviceType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import * as authRepository from '../repositories/auth.repository';
import type {
  ApiUserType,
  LoginBody,
  SignupBody,
} from '../schemas/auth.schema';
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
import { resolveIsProfileCompleted } from '../utils/profile.util';

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
  refreshTokenMaxAgeMs: number;
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
  return userType === 'MOVER' ? UserType.MOVER : UserType.CUSTOMER;
};

const toApiUserType = (userType: UserType): ApiUserType => {
  return userType === UserType.MOVER ? 'MOVER' : 'CUSTOMER';
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

  if (!localAuth?.passwordHash || !isPasswordMatched) {
    throw new AppError('INVALID_CREDENTIALS');
  }

  const apiUserType = toApiUserType(user.userType);

  if (apiUserType !== input.userType) {
    throw new AppError('USER_TYPE_MISMATCH');
  }

  const accessToken = createAccessToken(user.id, apiUserType);
  const refreshToken = createRefreshToken(user.id);
  const { expiresAt, maxAgeMs } = getAuthRefreshTokenExpiry(refreshToken);

  await prisma.$transaction(async (tx) => {
    // 사용자당 한 개 정책 — 기존 Refresh Token을 교체한다
    await authRepository.deleteRefreshTokensByUserId(user.id, tx);

    // 원문 대신 해시만 저장해 DB 유출 시에도 토큰 재사용을 어렵게 한다
    await authRepository.createRefreshTokenRecord(
      {
        userId: user.id,
        tokenHash: hashAuthRefreshToken(refreshToken),
        device: input.device,
        expiresAt,
      },
      tx
    );
  });

  return {
    user: {
      id: user.id,
      userType: apiUserType,
      email: user.email,
      phoneNumber: user.phoneNumber ?? '',
      isProfileCompleted: resolveIsProfileCompleted(
        user.userType,
        user.customerProfile,
        user.moverProfile
      ),
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
    const result = await prisma.$transaction(async (tx) => {
      const user = await authRepository.createUserWithLocalAuth(
        {
          name: input.name,
          nickname: input.nickname,
          email: input.email,
          phoneNumber: input.phoneNumber,
          userType: toPrismaUserType(input.userType),
          passwordHash,
        },
        tx
      );

      const apiUserType = toApiUserType(user.userType);
      const accessToken = createAccessToken(user.id, apiUserType);
      const refreshToken = createRefreshToken(user.id);
      const { expiresAt, maxAgeMs } = getAuthRefreshTokenExpiry(refreshToken);

      await authRepository.createRefreshTokenRecord(
        {
          userId: user.id,
          tokenHash: hashAuthRefreshToken(refreshToken),
          device: input.device,
          expiresAt,
        },
        tx
      );

      return {
        user,
        accessToken,
        refreshToken,
        refreshTokenMaxAgeMs: maxAgeMs,
      };
    });

    return {
      user: {
        id: result.user.id,
        userType: toApiUserType(result.user.userType),
        name: result.user.name,
        nickname: result.user.nickname,
        email: result.user.email,
        phoneNumber: result.user.phoneNumber ?? input.phoneNumber,
        isProfileCompleted: resolveIsProfileCompleted(
          result.user.userType,
          result.user.customerProfile,
          result.user.moverProfile
        ),
        createdAt: result.user.createdAt,
      },
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      refreshTokenMaxAgeMs: result.refreshTokenMaxAgeMs,
    };
  } catch (error) {
    const appError = toAppErrorFromPrisma(error);

    if (appError) {
      throw appError;
    }

    throw error;
  }
};

/**
 * Refresh Cookie 기준 세션만 정리한다.
 * JWT 검증·계정 조회 없이 해시 삭제를 시도해 멱등 로그아웃을 보장한다.
 */
export const logout = async (
  refreshToken: string | undefined
): Promise<void> => {
  // 쿠키가 없으면 DB에 지울 대상이 없으므로 조회·삭제 없이 종료한다.
  if (!refreshToken) {
    return;
  }

  // 만료·위조 JWT여도 동일 문자열 해시로 DB에 남은 레코드를 제거할 수 있다.
  const tokenHash = hashAuthRefreshToken(refreshToken);
  await authRepository.deleteRefreshTokenByHash(tokenHash);
};
