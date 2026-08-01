import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';

export const getUserCount = async (where: Prisma.UserWhereInput) => {
  return prisma.user.count({ where });
};

export const getUserRecentActivities = async (where: Prisma.UserWhereInput) => {
  return prisma.user.findMany({
    where,
    select: {
      nickname: true,
      email: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 5,
  });
};
