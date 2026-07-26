import type { DeviceType } from '@prisma/client';
import { prisma } from '../lib/prisma';

export const findAdminByEmail = async (email: string) => {
  return prisma.adminUser.findUnique({
    where: { email },
  });
};

export const createAdminRefreshTokenRecord = async (data: {
  adminId: number;
  tokenHash: string;
  device: DeviceType;
  expiresAt: Date;
}) => {
  return prisma.adminRefreshToken.create({
    data,
  });
};
