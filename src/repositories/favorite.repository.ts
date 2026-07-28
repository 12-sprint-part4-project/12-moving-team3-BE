import type { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';

const favoriteSelect = {
  id: true,
  userId: true,
  moverId: true,
  createdAt: true,
} satisfies Prisma.FavoriteSelect;

// TODO: 필요 시 tx?: Prisma.TransactionClient 지원 (다른 repository와 패턴 통일)
export const findFavoriteByUserAndMover = async (
  userId: string,
  moverId: string
) => {
  return prisma.favorite.findUnique({
    where: {
      userId_moverId: {
        userId,
        moverId,
      },
    },
    select: favoriteSelect,
  });
};

export const createFavorite = async (userId: string, moverId: string) => {
  return prisma.favorite.create({
    data: {
      userId,
      moverId,
    },
    select: favoriteSelect,
  });
};

export const deleteFavoriteByUserAndMover = async (
  userId: string,
  moverId: string
) => {
  const result = await prisma.favorite.deleteMany({
    where: {
      userId,
      moverId,
    },
  });

  return result.count;
};

export const countMoverFavorited = async (moverId: string) => {
  return prisma.favorite.count({
    where: { moverId },
  });
};
