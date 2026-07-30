import type { DeviceType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

type DbClient = typeof prisma | Prisma.TransactionClient;

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
  data: CreateAdminRefreshTokenRecordInput,
  db: DbClient = prisma
) => {
  return db.adminRefreshToken.create({
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
      device: true,
      expiresAt: true,
    },
  });
};

/** Rotation 시 검증된 레코드 한 건만 폐기한다. adminId 전체 삭제는 하지 않는다. */
export const deleteAdminRefreshTokenById = async (
  id: number,
  db: DbClient = prisma
) => {
  return db.adminRefreshToken.delete({
    where: { id },
  });
};
