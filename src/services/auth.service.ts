import { UserType, type DeviceType } from '@prisma/client';
import * as authRepository from '../repositories/auth.repository';
import type { ApiUserType, SignupBody } from '../schemas/auth.schema';
import { AppError } from '../utils/app.error';
import {
  createAccessToken,
  createRefreshToken,
  getAuthRefreshTokenExpiry,
} from '../utils/auth-jwt.util';
import { hashAuthPassword } from '../utils/auth-password.util';
import { hashAuthRefreshToken } from '../utils/auth-token-hash.util';
import { toAppErrorFromPrisma } from '../utils/prisma-error.util';

export interface SignupServiceInput extends SignupBody {
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

const toPrismaUserType = (userType: ApiUserType): UserType => {
  return userType === 'DRIVER' ? UserType.MOVER : UserType.CUSTOMER;
};

const toApiUserType = (userType: UserType): ApiUserType => {
  return userType === UserType.MOVER ? 'DRIVER' : 'CUSTOMER';
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

    const accessToken = createAccessToken(user.id);
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
