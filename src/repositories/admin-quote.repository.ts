import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';

export const getQuoteCount = async (where: Prisma.QuoteWhereInput) => {
  return prisma.quote.count({ where });
};

export const averageCompletedQuotePrice = async (
  where: Prisma.QuoteWhereInput
) => {
  const result = await prisma.quote.aggregate({
    where,
    _avg: {
      price: true,
    },
  });

  return result._avg.price ?? 0;
};

export const totalCompletedQuotePrice = async (
  where: Prisma.QuoteWhereInput
) => {
  const result = await prisma.quote.aggregate({
    where,
    _sum: {
      price: true,
    },
  });

  return result._sum.price ?? 0;
};
