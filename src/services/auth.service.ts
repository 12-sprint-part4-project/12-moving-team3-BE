import { UserStatus, UserType, type DeviceType } from '@prisma/client';
import { JsonWebTokenError } from 'jsonwebtoken';
import { runAuditedTransaction } from '../lib/audit-context';
import * as adminAuthRepository from '../repositories/admin-auth.repository';
import * as authRepository from '../repositories/auth.repository';
import type {
  ApiUserType,
  KakaoLoginBody,
  LoginBody,
  SignupBody,
} from '../schemas/auth.schema';
import {
  createAdminAccessToken,
  createAdminRefreshToken,
  getAdminRefreshTokenExpiry,
  verifyAdminRefreshToken,
  type AdminRefreshTokenPayload,
} from '../utils/admin-jwt.util';
import { AppError } from '../utils/app.error';
import {
  createAccessToken,
  createRefreshToken,
  getAuthRefreshTokenExpiry,
  verifyRefreshToken,
} from '../utils/auth-jwt.util';
import {
  ADMIN_PASSWORD_DUMMY_HASH,
  AUTH_PASSWORD_DUMMY_HASH,
  comparePassword,
  hashAuthPassword,
} from '../utils/password.util';
import { hashRefreshToken } from '../utils/token-hash.util';
import { toAppErrorFromPrisma } from '../utils/prisma-error.util';
import {
  exchangeKakaoAuthorizationCode,
  fetchKakaoUserInfo,
  type KakaoUserInfo,
} from '../utils/kakao-oauth.util';
import { resolveIsProfileCompleted } from '../utils/profile.util';

export type ApiUserStatus = 'ACTIVE' | 'SUSPENDED';

export interface UserLoginServiceInput extends LoginBody {
  audience: 'user';
  device: DeviceType;
}

export interface AdminLoginServiceInput {
  audience: 'admin';
  email: string;
  password: string;
  device: DeviceType;
}

export type LoginServiceInput = UserLoginServiceInput;

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

export interface AdminMeServiceResult {
  id: number;
  email: string;
  name: string;
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
        tokenHash: hashRefreshToken(refreshToken),
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
        tokenHash: hashRefreshToken(refreshToken),
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
        tokenHash: hashRefreshToken(refreshToken),
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

const authenticateUser = async (
  input: UserLoginServiceInput
): Promise<LoginServiceResult> => {
  const user = await authRepository.findUserWithLocalAuthByEmail(input.email);
  const localAuth = user?.authAccounts[0];

  // 계정 존재 여부를 응답/시간으로 구분하지 않기 위함
  const isPasswordMatched = await comparePassword(
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
        tokenHash: hashRefreshToken(refreshToken),
        device: input.device,
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

const authenticateAdmin = async (
  input: AdminLoginServiceInput
): Promise<AdminLoginServiceResult> => {
  const admin = await adminAuthRepository.findAdminByEmail(input.email);

  const isPasswordMatched = await comparePassword(
    input.password,
    admin?.passwordHash ?? ADMIN_PASSWORD_DUMMY_HASH
  );

  if (!admin || !isPasswordMatched) {
    throw new AppError('ADMIN_INVALID_CREDENTIALS');
  }

  const accessToken = createAdminAccessToken(admin.id);
  const refreshToken = createAdminRefreshToken(admin.id);
  const { expiresAt, maxAgeMs } = getAdminRefreshTokenExpiry(refreshToken);

  await adminAuthRepository.createAdminRefreshTokenRecord({
    adminId: admin.id,
    tokenHash: hashRefreshToken(refreshToken),
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

/**
 * 일반/관리자 로그인의 공통 진입점.
 * 조회·비밀번호 검증·role JWT 발급은 audience에 따라 나뉜다.
 */
export function login(
  input: UserLoginServiceInput
): Promise<LoginServiceResult>;
export function login(
  input: AdminLoginServiceInput
): Promise<AdminLoginServiceResult>;
export function login(
  input: UserLoginServiceInput | AdminLoginServiceInput
): Promise<LoginServiceResult | AdminLoginServiceResult> {
  if (input.audience === 'admin') {
    return authenticateAdmin(input);
  }

  return authenticateUser(input);
}

export const getAdminMe = async (
  adminId: number
): Promise<AdminMeServiceResult> => {
  const admin = await adminAuthRepository.findAdminById(adminId);

  if (!admin) {
    throw new AppError('ADMIN_UNAUTHORIZED');
  }

  return admin;
};

interface AdminRefreshTokenRecord {
  id: number;
  adminId: number;
  tokenHash: string;
  device: DeviceType;
  expiresAt: Date;
}

interface ValidateAdminRefreshTokenResult {
  admin: {
    id: number;
    email: string;
    name: string;
  };
  refreshTokenRecord: AdminRefreshTokenRecord;
  payload: AdminRefreshTokenPayload;
}

const validateAdminRefreshToken = async (
  refreshToken: string | undefined
): Promise<ValidateAdminRefreshTokenResult> => {
  if (!refreshToken) {
    throw new AppError('ADMIN_UNAUTHORIZED');
  }

  let payload: AdminRefreshTokenPayload;

  try {
    payload = verifyAdminRefreshToken(refreshToken);
  } catch (error) {
    if (error instanceof JsonWebTokenError) {
      throw new AppError('ADMIN_UNAUTHORIZED');
    }

    throw error;
  }

  const tokenHash = hashRefreshToken(refreshToken);
  const refreshTokenRecord =
    await adminAuthRepository.findAdminRefreshTokenByHash(tokenHash);

  if (!refreshTokenRecord) {
    throw new AppError('ADMIN_UNAUTHORIZED');
  }

  if (refreshTokenRecord.expiresAt.getTime() <= Date.now()) {
    throw new AppError('ADMIN_UNAUTHORIZED');
  }

  if (payload.sub !== refreshTokenRecord.adminId) {
    throw new AppError('ADMIN_UNAUTHORIZED');
  }

  const admin = await adminAuthRepository.findAdminById(
    refreshTokenRecord.adminId
  );

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
}

export const refreshAdminToken = async (
  refreshToken: string | undefined
): Promise<RefreshAdminTokenResult> => {
  const { admin } = await validateAdminRefreshToken(refreshToken);

  return { accessToken: createAdminAccessToken(admin.id) };
};

export const logoutAdmin = async (
  refreshToken: string | undefined
): Promise<void> => {
  if (!refreshToken) {
    return;
  }

  const tokenHash = hashRefreshToken(refreshToken);
  await adminAuthRepository.deleteAdminRefreshTokenByHash(tokenHash);
};

/** 계정만 생성한다. Access/Refresh Token은 발급하지 않는다(로그인 필요). */
export const signup = async (
  input: SignupBody
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
    const user = await runAuditedTransaction(async (tx) => {
      return authRepository.createUserWithLocalAuth(
        {
          name: input.name,
          nickname: input.nickname,
          email: input.email,
          userType: toPrismaUserType(input.userType),
          passwordHash,
        },
        tx
      );
    });

    return {
      user: {
        id: user.id,
        userType: toApiUserType(user.userType),
        name: user.name,
        nickname: user.nickname,
        email: user.email,
        phoneNumber: user.phoneNumber ?? '',
        isProfileCompleted: resolveIsProfileCompleted(
          user.userType,
          user.customerProfile,
          user.moverProfile
        ),
        createdAt: user.createdAt,
      },
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

  const tokenHash = hashRefreshToken(refreshToken);

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
        tokenHash: hashRefreshToken(nextRefreshToken),
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
  const tokenHash = hashRefreshToken(refreshToken);
  await authRepository.deleteRefreshTokenByHash(tokenHash);
};
