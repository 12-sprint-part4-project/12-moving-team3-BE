import type { DeviceType } from '@prisma/client';
import { prisma } from '../lib/prisma';

export const findAdminByEmail = async (email: string) => {
  return prisma.adminUser.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      passwordHash: true,
    },
  });
};

export const findAdminById = async (adminId: number) => {
  return prisma.adminUser.findUnique({
    where: { id: adminId },
    select: {
      id: true,
      email: true,
      name: true,
    },
  });
};

export interface CreateAdminRefreshTokenRecordInput {
  adminId: number;
  tokenHash: string;
  device: DeviceType;
  expiresAt: Date;
}

export const createAdminRefreshTokenRecord = async (
  data: CreateAdminRefreshTokenRecordInput
) => {
  return prisma.adminRefreshToken.create({
    data,
  });
};

/** 원문 대신 해시로 조회해 DB에 평문 Refresh Token을 두지 않는다. */
export const findAdminRefreshTokenByHash = async (tokenHash: string) => {
  return prisma.adminRefreshToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      adminId: true,
      tokenHash: true,
      expiresAt: true,
    },
  });
};
