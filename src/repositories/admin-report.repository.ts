import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';

export const getTotalReportCount = async (
  where: Prisma.UserReportWhereInput
) => {
  return prisma.userReport.count({ where });
};
