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

/**
 * 고객이 moverIds 중 찜한 기사 id 집합
 * 목록 N+1 방지용 — moverIds가 비면 빈 Set
 */
export const findFavoritedMoverIdsByUser = async (
  userId: string,
  moverIds: string[]
): Promise<Set<string>> => {
  if (moverIds.length === 0) {
    return new Set();
  }

  const rows = await prisma.favorite.findMany({
    where: {
      userId,
      moverId: { in: moverIds },
    },
    select: { moverId: true },
  });

  return new Set(
    rows
      .map((row) => row.moverId)
      .filter((moverId): moverId is string => moverId != null)
  );
};
