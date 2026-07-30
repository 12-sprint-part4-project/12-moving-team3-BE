import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';

export const getUserCount = async (where?: Prisma.DateTimeFilter) => {
  return prisma.user.count({
    where: { deletedAt: null, ...(where && { createdAt: where }) },
  });
};

export const getEstimateRequestCount = async (
  where?: Prisma.DateTimeFilter
) => {
  return prisma.estimateRequest.count({
    where: { status: { not: 'DRAFT' }, ...(where && { submittedAt: where }) },
  });
};

export const getQuoteCount = async (where?: Prisma.DateTimeFilter) => {
  return prisma.quote.count({
    where: {
      status: { not: 'REJECTED' },
      deletedAt: null,
      ...(where && { createdAt: where }),
    },
  });
};

export const getCompletedEstimateRequestCount = async (
  where?: Prisma.DateTimeFilter
) => {
  return prisma.estimateRequest.count({
    where: { status: 'COMPLETED', ...(where && { moveDate: where }) },
  });
};

export const getPendingReportCount = async (where?: Prisma.DateTimeFilter) => {
  return prisma.userReport.count({
    where: { status: 'PENDING', ...(where && { createdAt: where }) },
  });
};
