import { UserStatus, UserType, type DeviceType } from '@prisma/client';
import { JsonWebTokenError } from 'jsonwebtoken';
import { runAuditedTransaction } from '../lib/audit-context';
import * as authRepository from '../repositories/auth.repository';
import type {
  ApiUserType,
  KakaoLoginBody,
  LoginBody,
  SignupBody,
} from '../schemas/auth.schema';
import { AppError } from '../utils/app.error';
import {
  createAccessToken,
  createRefreshToken,
  getAuthRefreshTokenExpiry,
  verifyRefreshToken,
} from '../utils/auth-jwt.util';
import {
  AUTH_PASSWORD_DUMMY_HASH,
  compareAuthPassword,
  hashAuthPassword,
} from '../utils/auth-password.util';
import { hashAuthRefreshToken } from '../utils/auth-token-hash.util';
import { toAppErrorFromPrisma } from '../utils/prisma-error.util';
import {
  exchangeKakaoAuthorizationCode,
  fetchKakaoUserInfo,
  type KakaoUserInfo,
} from '../utils/kakao-oauth.util';
import { resolveIsProfileCompleted } from '../utils/profile.util';

export type ApiUserStatus = 'ACTIVE' | 'SUSPENDED';

export interface SignupServiceInput extends SignupBody {
  device: DeviceType;
}

export interface LoginServiceInput extends LoginBody {
  device: DeviceType;
}

export interface KakaoLoginServiceInput extends KakaoLoginBody {
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

export interface AuthApiUser {
  id: string;
  userType: ApiUserType;
  nickname: string;
  email: string;
  phoneNumber: string;
  isProfileCompleted: boolean;
  status: ApiUserStatus;
}

export interface LoginServiceResult {
  user: AuthApiUser;
  accessToken: string;
  refreshToken: string;
  refreshTokenMaxAgeMs: number;
}

export interface KakaoLoginServiceResult extends LoginServiceResult {
  isNewUser: boolean;
}

interface KakaoAuthUser {
  id: string;
  userType: UserType;
  nickname: string;
  email: string;
  phoneNumber: string | null;
  customerProfile: { id: number; service: unknown[] } | null;
  moverProfile: { id: number; service: unknown[] } | null;
  userStatus: { status: UserStatus } | null;
}

const toPrismaUserType = (userType: ApiUserType): UserType => {
  return userType === 'MOVER' ? UserType.MOVER : UserType.CUSTOMER;
};

const toApiUserType = (userType: UserType): ApiUserType => {
  return userType === UserType.MOVER ? 'MOVER' : 'CUSTOMER';
};

/** UserStatusInfo가 없으면 ACTIVE로 정규화한다 */
const resolveUserStatus = (
  userStatus: { status: UserStatus } | null | undefined
): ApiUserStatus => {
  return userStatus?.status === UserStatus.SUSPENDED ? 'SUSPENDED' : 'ACTIVE';
};

/** login / kakao / me 공통 user 응답 매핑 */
const toAuthApiUser = (user: KakaoAuthUser): AuthApiUser => {
  return {
    id: user.id,
    userType: toApiUserType(user.userType),
    nickname: user.nickname,
    email: user.email,
    phoneNumber: user.phoneNumber ?? '',
    isProfileCompleted: resolveIsProfileCompleted(
      user.userType,
      user.customerProfile,
      user.moverProfile
    ),
    status: resolveUserStatus(user.userStatus),
  };
};

const issueAuthSession = async (
  user: KakaoAuthUser,
  device: DeviceType
): Promise<LoginServiceResult> => {
  const apiUserType = toApiUserType(user.userType);
  const accessToken = createAccessToken(user.id, apiUserType);
  const refreshToken = createRefreshToken(user.id);
  const { expiresAt, maxAgeMs } = getAuthRefreshTokenExpiry(refreshToken);

  await runAuditedTransaction(async (tx) => {
    await authRepository.deleteRefreshTokensByUserId(user.id, tx);
    await authRepository.createRefreshTokenRecord(
      {
        userId: user.id,
        tokenHash: hashAuthRefreshToken(refreshToken),
        device,
        expiresAt,
      },
      tx
    );
  });

  return {
    user: toAuthApiUser(user),
    accessToken,
    refreshToken,
    refreshTokenMaxAgeMs: maxAgeMs,
  };
};

/** Access Token으로 현재 로그인 유저 조회 (토큰은 응답에 포함하지 않음) */
export const getMe = async (userId: string): Promise<AuthApiUser> => {
  const user = await authRepository.findUserForAuthById(userId);

  // 토큰은 유효해도 계정이 없으면 인증된 사용자로 취급하지 않는다.
  if (!user) {
    throw new AppError('UNAUTHORIZED');
  }

  return toAuthApiUser(user);
};

const resolveUniqueKakaoNickname = async (
  preferred: string | undefined,
  kakaoId: string
): Promise<string> => {
  const base = (preferred?.trim() || `kakao_${kakaoId}`).slice(0, 50);
  const existingBase = await authRepository.findUserByNickname(base);

  if (!existingBase) {
    return base;
  }

  const fallback = `kakao_${kakaoId}`.slice(0, 50);
  const existingFallback = await authRepository.findUserByNickname(fallback);

  if (!existingFallback) {
    return fallback;
  }

  return `${kakaoId}_${Date.now()}`.slice(0, 50);
};

/**
 * 카카오 이메일이 존재하고 인증되었는지 검사한 뒤 정규화된 이메일을 반환한다.
 */
const requireVerifiedKakaoEmail = (kakaoUser: KakaoUserInfo): string => {
  if (!kakaoUser.email?.trim()) {
    throw new AppError('KAKAO_EMAIL_REQUIRED');
  }

  if (!kakaoUser.isEmailVerified) {
    throw new AppError('KAKAO_EMAIL_NOT_VERIFIED');
  }

  return kakaoUser.email.trim().toLowerCase();
};

const createKakaoUser = async (
  kakaoUser: KakaoUserInfo,
  userType: ApiUserType,
  device: DeviceType
): Promise<LoginServiceResult> => {
  const email = requireVerifiedKakaoEmail(kakaoUser);

  // 카카오 실명(name) 권한은 사업자 비즈앱 필요 → 소셜 가입 시 name = nickname
  const nickname = await resolveUniqueKakaoNickname(
    kakaoUser.nickname,
    kakaoUser.id
  );
  const name = nickname;

  const result = await runAuditedTransaction(async (tx) => {
    const user = await authRepository.createUserWithKakaoAuth(
      {
        name,
        nickname,
        email,
        userType: toPrismaUserType(userType),
        providerAccountId: kakaoUser.id,
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
        device,
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
    user: toAuthApiUser(result.user),
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    refreshTokenMaxAgeMs: result.refreshTokenMaxAgeMs,
  };
};

/**
 * 동일 이메일의 기존 계정에 카카오를 연결한 뒤 세션을 발급한다.
 */
const linkKakaoToExistingUser = async (
  kakaoUser: KakaoUserInfo,
  userType: ApiUserType,
  device: DeviceType
): Promise<LoginServiceResult | null> => {
  const email = requireVerifiedKakaoEmail(kakaoUser);
  const existing = await authRepository.findUserWithKakaoAuthByEmail(email);

  if (!existing) {
    return null;
  }

  if (toApiUserType(existing.userType) !== userType) {
    throw new AppError('USER_TYPE_MISMATCH');
  }

  const linkedKakao = existing.authAccounts[0];

  if (linkedKakao && linkedKakao.providerAccountId !== kakaoUser.id) {
    throw new AppError('EMAIL_ALREADY_EXISTS');
  }

  const { authAccounts: _authAccounts, ...user } = existing;
  const apiUserType = toApiUserType(user.userType);
  const accessToken = createAccessToken(user.id, apiUserType);
  const refreshToken = createRefreshToken(user.id);
  const { expiresAt, maxAgeMs } = getAuthRefreshTokenExpiry(refreshToken);

  await runAuditedTransaction(async (tx) => {
    if (!linkedKakao) {
      await authRepository.linkKakaoAuthToUser(existing.id, kakaoUser.id, tx);
    }

    await authRepository.deleteRefreshTokensByUserId(user.id, tx);
    await authRepository.createRefreshTokenRecord(
      {
        userId: user.id,
        tokenHash: hashAuthRefreshToken(refreshToken),
        device,
        expiresAt,
      },
      tx
    );
  });

  return {
    user: toAuthApiUser(user),
    accessToken,
    refreshToken,
    refreshTokenMaxAgeMs: maxAgeMs,
  };
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

  await runAuditedTransaction(async (tx) => {
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

  const { authAccounts: _authAccounts, ...authUser } = user;

  return {
    user: toAuthApiUser(authUser),
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

  const passwordHash = await hashAuthPassword(input.password);

  try {
    const result = await runAuditedTransaction(async (tx) => {
      const user = await authRepository.createUserWithLocalAuth(
        {
          name: input.name,
          nickname: input.nickname,
          email: input.email,
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
        phoneNumber: result.user.phoneNumber ?? '',
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
 * 카카오 로그인: code → 토큰 → 유저 정보 → DB 조회 후 회원가입 또는 로그인.
 * 우리 서비스 Access/Refresh Token을 발급한다.
 * 동일 이메일의 기존 계정(로컬 등)이 있으면 카카오를 연동한 뒤 로그인한다.
 */
export const kakaoLogin = async (
  input: KakaoLoginServiceInput
): Promise<KakaoLoginServiceResult> => {
  const kakaoToken = await exchangeKakaoAuthorizationCode(input.code);
  const kakaoUser = await fetchKakaoUserInfo(kakaoToken.accessToken);

  const existingUser = await authRepository.findUserByKakaoProviderAccountId(
    kakaoUser.id
  );

  if (existingUser) {
    if (toApiUserType(existingUser.userType) !== input.userType) {
      throw new AppError('USER_TYPE_MISMATCH');
    }

    const session = await issueAuthSession(existingUser, input.device);

    return {
      ...session,
      isNewUser: false,
    };
  }

  try {
    const linkedSession = await linkKakaoToExistingUser(
      kakaoUser,
      input.userType,
      input.device
    );

    if (linkedSession) {
      return {
        ...linkedSession,
        isNewUser: false,
      };
    }

    const session = await createKakaoUser(
      kakaoUser,
      input.userType,
      input.device
    );

    return {
      ...session,
      isNewUser: true,
    };
  } catch (error) {
    const appError = toAppErrorFromPrisma(error);

    if (appError) {
      throw appError;
    }

    throw error;
  }
};

export const refreshAuthToken = async (
  refreshToken: string | undefined
): Promise<{
  accessToken: string;
  refreshToken: string;
  refreshTokenMaxAgeMs: number;
}> => {
  if (!refreshToken) {
    throw new AppError('UNAUTHORIZED');
  }

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch (error) {
    if (error instanceof JsonWebTokenError) {
      throw new AppError('UNAUTHORIZED');
    }
    throw error;
  }

  const tokenHash = hashAuthRefreshToken(refreshToken);

  return runAuditedTransaction(async (tx) => {
    const record = await authRepository.findRefreshTokenByHash(tokenHash, tx);

    if (
      !record ||
      record.expiresAt.getTime() <= Date.now() ||
      payload.sub !== record.userId
    ) {
      throw new AppError('UNAUTHORIZED');
    }

    const { count } = await authRepository.deleteRefreshTokenByHash(
      tokenHash,
      tx
    );

    // 동시 Rotation 등으로 이미 삭제된 토큰이면 재발급하지 않는다.
    if (count === 0) {
      throw new AppError('UNAUTHORIZED');
    }

    const apiUserType = toApiUserType(record.user.userType);
    const accessToken = createAccessToken(record.user.id, apiUserType);
    const nextRefreshToken = createRefreshToken(record.user.id);
    const { expiresAt, maxAgeMs } = getAuthRefreshTokenExpiry(nextRefreshToken);

    await authRepository.createRefreshTokenRecord(
      {
        userId: record.user.id,
        tokenHash: hashAuthRefreshToken(nextRefreshToken),
        device: record.device,
        expiresAt,
      },
      tx
    );

    return {
      accessToken,
      refreshToken: nextRefreshToken,
      refreshTokenMaxAgeMs: maxAgeMs,
    };
  });
};

/**
 * Refresh Cookie 기준 세션만 정리한다.
 * JWT 검증·계정 조회 없이 해시 삭제를 시도해 멱등 동작을 보장한다.
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
