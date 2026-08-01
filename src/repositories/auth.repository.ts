import {
  AuthProvider,
  UserType,
  type DeviceType,
  type Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma';

type DbClient = typeof prisma | Prisma.TransactionClient;

export const findUserByEmail = async (email: string) => {
  return prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
};

export const findUserByNickname = async (nickname: string) => {
  return prisma.user.findUnique({
    where: { nickname },
    select: { id: true },
  });
};

export const findUserByPhoneNumber = async (phoneNumber: string) => {
  return prisma.user.findUnique({
    where: { phoneNumber },
    select: { id: true },
  });
};

const userAuthSelect = {
  id: true,
  userType: true,
  name: true,
  nickname: true,
  email: true,
  phoneNumber: true,
  createdAt: true,
  customerProfile: { select: { id: true, service: true } },
  moverProfile: { select: { id: true, service: true } },
} as const;

export const findUserWithLocalAuthByEmail = async (email: string) => {
  return prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      userType: true,
      nickname: true,
      email: true,
      phoneNumber: true,
      customerProfile: { select: { id: true, service: true } },
      moverProfile: { select: { id: true, service: true } },
      authAccounts: {
        where: { provider: 'LOCAL' },
        select: { passwordHash: true },
        take: 1,
      },
    },
  });
};

/**
 * 카카오 providerAccountId(회원번호)로 연결된 User를 조회한다.
 */
export const findUserByKakaoProviderAccountId = async (
  providerAccountId: string
) => {
  const authAccount = await prisma.authAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider: AuthProvider.KAKAO,
        providerAccountId,
      },
    },
    select: {
      user: {
        select: userAuthSelect,
      },
    },
  });

  return authAccount?.user ?? null;
};

/**
 * 이메일로 유저를 조회하고, 이미 연결된 카카오 AuthAccount가 있는지도 함께 반환한다.
 */
export const findUserWithKakaoAuthByEmail = async (email: string) => {
  return prisma.user.findUnique({
    where: { email },
    select: {
      ...userAuthSelect,
      authAccounts: {
        where: { provider: AuthProvider.KAKAO },
        select: { providerAccountId: true },
        take: 1,
      },
    },
  });
};

/**
 * 기존 User에 카카오 AuthAccount를 연결한다.
 */
export const linkKakaoAuthToUser = async (
  userId: string,
  providerAccountId: string,
  db: DbClient = prisma
) => {
  return db.authAccount.create({
    data: {
      userId,
      provider: AuthProvider.KAKAO,
      providerAccountId,
    },
  });
};

export const deleteRefreshTokensByUserId = async (
  userId: string,
  db: DbClient = prisma
) => {
  return db.refreshToken.deleteMany({
    where: { userId },
  });
};

export const findRefreshTokenByHash = async (
  tokenHash: string,
  db: DbClient = prisma
) => {
  return db.refreshToken.findUnique({
    where: { tokenHash },
    select: {
      userId: true,
      device: true,
      expiresAt: true,
      user: { select: { id: true, userType: true } },
    },
  });
};

/**
 * 로그아웃·Rotation용 멱등 삭제. 레코드가 없어도 예외를 내지 않는다.
 * tokenHash 한 건만 대상으로 하며 사용자 전체 토큰은 지우지 않는다.
 */
export const deleteRefreshTokenByHash = async (
  tokenHash: string,
  db: DbClient = prisma
) => {
  return db.refreshToken.deleteMany({
    where: { tokenHash },
  });
};

export interface CreateUserWithLocalAuthInput {
  name: string;
  nickname: string;
  email: string;
  phoneNumber: string;
  userType: UserType;
  passwordHash: string;
}

export const createUserWithLocalAuth = async (
  input: CreateUserWithLocalAuthInput,
  db: DbClient = prisma
) => {
  return db.user.create({
    data: {
      name: input.name,
      nickname: input.nickname,
      email: input.email,
      phoneNumber: input.phoneNumber,
      userType: input.userType,
      authAccounts: {
        create: {
          provider: 'LOCAL',
          passwordHash: input.passwordHash,
        },
      },
      ...(input.userType === UserType.CUSTOMER
        ? {
            customerProfile: {
              create: {},
            },
          }
        : {}),
      ...(input.userType === UserType.MOVER
        ? {
            moverProfile: {
              create: {},
            },
          }
        : {}),
    },
    select: userAuthSelect,
  });
};

export interface CreateUserWithKakaoAuthInput {
  name: string;
  nickname: string;
  email: string;
  userType: UserType;
  providerAccountId: string;
}

export const createUserWithKakaoAuth = async (
  input: CreateUserWithKakaoAuthInput,
  db: DbClient = prisma
) => {
  return db.user.create({
    data: {
      name: input.name,
      nickname: input.nickname,
      email: input.email,
      userType: input.userType,
      authAccounts: {
        create: {
          provider: AuthProvider.KAKAO,
          providerAccountId: input.providerAccountId,
        },
      },
      ...(input.userType === UserType.CUSTOMER
        ? {
            customerProfile: {
              create: {},
            },
          }
        : {}),
      ...(input.userType === UserType.MOVER
        ? {
            moverProfile: {
              create: {},
            },
          }
        : {}),
    },
    select: userAuthSelect,
  });
};

export interface CreateRefreshTokenRecordInput {
  userId: string;
  tokenHash: string;
  device: DeviceType;
  expiresAt: Date;
}

export const createRefreshTokenRecord = async (
  data: CreateRefreshTokenRecordInput,
  db: DbClient = prisma
) => {
  return db.refreshToken.create({
    data,
  });
};
