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
