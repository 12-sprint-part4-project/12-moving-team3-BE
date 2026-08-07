import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';

export const getReviewCount = async (where: Prisma.ReviewWhereInput) => {
  return prisma.review.count({ where });
};

export const getAverageReviewScore = async (where: Prisma.ReviewWhereInput) => {
  const result = await prisma.review.aggregate({
    where,
    _avg: {
      rating: true,
    },
  });

  return result._avg.rating ?? 0;
};
