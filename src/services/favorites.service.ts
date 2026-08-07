import * as favoriteRepository from '../repositories/favorite.repository';
import { findUserById } from '../repositories/user.repository';
import { AppError } from '../utils/app.error';
import { Prisma } from '@prisma/client';

const isUniqueConstraintError = (error: unknown): boolean => {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
};

interface AddFavoriteInput {
  userId: string;
  moverId: string;
}

export const addFavorite = async ({ userId, moverId }: AddFavoriteInput) => {
  // 본인 userId를 기사 id로 넘긴 경우 (CUSTOMER만 이 API에 도달)
  if (userId === moverId) {
    throw new AppError('CANNOT_FAVORITE_SELF');
  }

  const mover = await findUserById(moverId);

  if (!mover || mover.deletedAt || mover.userType !== 'MOVER') {
    throw new AppError('MOVER_NOT_FOUND');
  }

  const existingFavorite = await favoriteRepository.findFavoriteByUserAndMover(
    userId,
    moverId
  );

  if (existingFavorite) {
    throw new AppError('ALREADY_FAVORITED');
  }

  try {
    return await favoriteRepository.createFavorite(userId, moverId);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppError('ALREADY_FAVORITED');
    }

    throw error;
  }
};

interface RemoveFavoriteInput {
  userId: string;
  moverId: string;
}

export const removeFavorite = async ({
  userId,
  moverId,
}: RemoveFavoriteInput) => {
  const deletedCount = await favoriteRepository.deleteFavoriteByUserAndMover(
    userId,
    moverId
  );

  if (deletedCount === 0) {
    throw new AppError('FAVORITE_NOT_FOUND');
  }
};
