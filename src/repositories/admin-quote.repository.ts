import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';

export const getQuoteCount = async (where: Prisma.QuoteWhereInput) => {
  return prisma.quote.count({ where });
};
