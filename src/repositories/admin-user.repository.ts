import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';

export const getUserCount = async (where: Prisma.UserWhereInput) => {
  return prisma.user.count({ where });
};
