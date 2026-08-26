import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { AppError } from '../utils/app.error';
import { addFavorite, removeFavorite } from './favorites.service';

interface MutableFavoriteRepository {
  findFavoriteByUserAndMover: (
    userId: string,
    moverId: string
  ) => Promise<unknown>;
  createFavorite: (userId: string, moverId: string) => Promise<unknown>;
  deleteFavoriteByUserAndMover: (
    userId: string,
    moverId: string
  ) => Promise<number>;
}

interface MutableUserRepository {
  findUserById: (id: string) => Promise<{
    id: string;
    userType: string;
    deletedAt: Date | null;
  } | null>;
}

const favoriteRepository =
  require('../repositories/favorite.repository') as MutableFavoriteRepository;
const userRepository =
  require('../repositories/user.repository') as MutableUserRepository;

const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const MOVER_ID = '22222222-2222-4222-8222-222222222222';

const stubActiveMover = () => {
  userRepository.findUserById = async () => ({
    id: MOVER_ID,
    userType: 'MOVER',
    deletedAt: null,
  });
};

describe('addFavorite', () => {
  const originalFindFavoriteByUserAndMover =
    favoriteRepository.findFavoriteByUserAndMover;
  const originalCreateFavorite = favoriteRepository.createFavorite;
  const originalFindUserById = userRepository.findUserById;

  after(() => {
    favoriteRepository.findFavoriteByUserAndMover =
      originalFindFavoriteByUserAndMover;
    favoriteRepository.createFavorite = originalCreateFavorite;
    userRepository.findUserById = originalFindUserById;
  });

  it('본인 userId를 기사 id로 넘기면 CANNOT_FAVORITE_SELF를 던진다', async () => {
    await assert.rejects(
      () => addFavorite({ userId: CUSTOMER_ID, moverId: CUSTOMER_ID }),
      (error: unknown) =>
        error instanceof AppError && error.code === 'CANNOT_FAVORITE_SELF'
    );
  });

  it('기사가 아니거나 없으면 MOVER_NOT_FOUND를 던진다', async () => {
    userRepository.findUserById = async () => null;

    await assert.rejects(
      () => addFavorite({ userId: CUSTOMER_ID, moverId: MOVER_ID }),
      (error: unknown) =>
        error instanceof AppError && error.code === 'MOVER_NOT_FOUND'
    );

    userRepository.findUserById = async () => ({
      id: MOVER_ID,
      userType: 'CUSTOMER',
      deletedAt: null,
    });

    await assert.rejects(
      () => addFavorite({ userId: CUSTOMER_ID, moverId: MOVER_ID }),
      (error: unknown) =>
        error instanceof AppError && error.code === 'MOVER_NOT_FOUND'
    );
  });

  it('이미 찜한 기사면 ALREADY_FAVORITED를 던진다', async () => {
    stubActiveMover();
    favoriteRepository.findFavoriteByUserAndMover = async () => ({
      id: 1,
      userId: CUSTOMER_ID,
      moverId: MOVER_ID,
    });

    await assert.rejects(
      () => addFavorite({ userId: CUSTOMER_ID, moverId: MOVER_ID }),
      (error: unknown) =>
        error instanceof AppError && error.code === 'ALREADY_FAVORITED'
    );
  });
});

describe('removeFavorite', () => {
  const originalDeleteFavoriteByUserAndMover =
    favoriteRepository.deleteFavoriteByUserAndMover;

  after(() => {
    favoriteRepository.deleteFavoriteByUserAndMover =
      originalDeleteFavoriteByUserAndMover;
  });

  it('삭제된 행이 없으면 FAVORITE_NOT_FOUND를 던진다', async () => {
    favoriteRepository.deleteFavoriteByUserAndMover = async () => 0;

    await assert.rejects(
      () => removeFavorite({ userId: CUSTOMER_ID, moverId: MOVER_ID }),
      (error: unknown) =>
        error instanceof AppError && error.code === 'FAVORITE_NOT_FOUND'
    );
  });
});
