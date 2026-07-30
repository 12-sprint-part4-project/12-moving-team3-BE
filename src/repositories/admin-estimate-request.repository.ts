import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';

export const getEstimateRequestCount = async (
  where: Prisma.EstimateRequestWhereInput
) => {
  return prisma.estimateRequest.count({ where });
};
