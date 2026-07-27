import type { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';

const favoriteSelect = {
  id: true,
  userId: true,
  moverId: true,
  createdAt: true,
} satisfies Prisma.FavoriteSelect;

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
  return prisma.favorite.delete({
    where: {
      userId_moverId: {
        userId,
        moverId,
      },
    },
    select: favoriteSelect,
  });
};
