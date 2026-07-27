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
  userType: 'CUSTOMER' | 'MOVER';
  moverId: string;
}

export const addFavorite = async ({
  userId,
  userType,
  moverId,
}: AddFavoriteInput) => {
  // 인증된 유저의 타입은 auth에서 넘어온 값을 신뢰
  if (userType === 'MOVER') {
    throw new AppError('FORBIDDEN');
  }

  if (userId === moverId) {
    throw new AppError('MOVER_NOT_FOUND');
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
  const existingFavorite = await favoriteRepository.findFavoriteByUserAndMover(
    userId,
    moverId
  );

  if (!existingFavorite) {
    throw new AppError('FAVORITE_NOT_FOUND');
  }

  await favoriteRepository.deleteFavoriteByUserAndMover(userId, moverId);
};
