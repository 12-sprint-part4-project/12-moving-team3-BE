import { Prisma } from '@prisma/client';
import * as likeRepository from '../repositories/like.repository';
import * as postRepository from '../repositories/post.repository';
import { AppError } from '../utils/app.error';

const isUniqueConstraintError = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';

/** 좋아요 추가 */
export const createLike = async (postId: number, userId: string) => {
  const post = await postRepository.findPostOwner(postId);

  if (!post) {
    throw new AppError('POST_NOT_FOUND');
  }

  const existing = await likeRepository.findLike(postId, userId);

  if (existing) {
    throw new AppError('LIKE_ALREADY_EXISTS');
  }

  try {
    const result = await likeRepository.createLike(postId, userId);

    if (!result) {
      throw new AppError('POST_NOT_FOUND');
    }
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppError('LIKE_ALREADY_EXISTS');
    }

    throw error;
  }
};

/** 좋아요 취소 */
export const deleteLike = async (postId: number, userId: string) => {
  const post = await postRepository.findPostOwner(postId);

  if (!post) {
    throw new AppError('POST_NOT_FOUND');
  }

  const existing = await likeRepository.findLike(postId, userId);

  if (!existing) {
    throw new AppError('LIKE_NOT_FOUND');
  }

  const result = await likeRepository.deleteLike(postId, userId);

  if (!result.deleted) {
    throw new AppError('LIKE_NOT_FOUND');
  }
};
