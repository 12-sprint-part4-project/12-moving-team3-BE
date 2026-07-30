import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';

export const getUserCount = async (where: Prisma.UserWhereInput) => {
  return prisma.user.count({ where });
};

export const getEstimateRequestCount = async (
  where: Prisma.EstimateRequestWhereInput
) => {
  return prisma.estimateRequest.count({ where });
};

export const getQuoteCount = async (where: Prisma.QuoteWhereInput) => {
  return prisma.quote.count({ where });
};

export const getPendingReportCount = async (
  where: Prisma.UserReportWhereInput
) => {
  return prisma.userReport.count({ where });
};
