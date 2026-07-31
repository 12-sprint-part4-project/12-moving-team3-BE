import { UserType, type DeviceType, type Prisma } from '@prisma/client';
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

export const findUserWithLocalAuthByEmail = async (email: string) => {
  return prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      userType: true,
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

export const deleteRefreshTokensByUserId = async (
  userId: string,
  db: DbClient = prisma
) => {
  return db.refreshToken.deleteMany({
    where: { userId },
  });
};

/**
 * 로그아웃용 멱등 삭제. 레코드가 없어도 예외를 내지 않는다.
 * tokenHash 한 건만 대상으로 하며 사용자 전체 토큰은 지우지 않는다.
 */
export const deleteRefreshTokenByHash = async (
  tokenHash: string
): Promise<void> => {
  await prisma.refreshToken.deleteMany({
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
    select: {
      id: true,
      userType: true,
      name: true,
      nickname: true,
      email: true,
      phoneNumber: true,
      createdAt: true,
      customerProfile: { select: { id: true, service: true } },
      moverProfile: { select: { id: true, service: true } },
    },
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
