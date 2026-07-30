import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';

export const getPendingReportCount = async (
  where: Prisma.UserReportWhereInput
) => {
  return prisma.userReport.count({ where });
};
