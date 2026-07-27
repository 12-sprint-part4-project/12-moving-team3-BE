import type { DeviceType, UserType } from '@prisma/client';
import { prisma } from '../lib/prisma';

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
      customerProfile: { select: { id: true } },
      moverProfile: { select: { id: true } },
      authAccounts: {
        where: { provider: 'LOCAL' },
        select: { passwordHash: true },
        take: 1,
      },
    },
  });
};

export const deleteRefreshTokensByUserId = async (userId: string) => {
  return prisma.refreshToken.deleteMany({
    where: { userId },
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
  input: CreateUserWithLocalAuthInput
) => {
  return prisma.user.create({
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
    },
    select: {
      id: true,
      userType: true,
      name: true,
      nickname: true,
      email: true,
      phoneNumber: true,
      createdAt: true,
      customerProfile: { select: { id: true } },
      moverProfile: { select: { id: true } },
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
  data: CreateRefreshTokenRecordInput
) => {
  return prisma.refreshToken.create({
    data,
  });
};
