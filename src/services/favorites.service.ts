import * as favoriteRepository from '../repositories/favorite.repository';
import { findUserById } from '../repositories/user.repository';
import { AppError } from '../utils/app.error';

const isUniqueConstraintError = (error: unknown): boolean => {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === 'P2002'
  );
};

interface AddFavoriteInput {
  userId: string;
  moverId: string;
}

export const addFavorite = async ({ userId, moverId }: AddFavoriteInput) => {
  if (userId === moverId) {
    throw new AppError('FORBIDDEN'); //TODO: 더 세분화된 에러코드로 변경
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
