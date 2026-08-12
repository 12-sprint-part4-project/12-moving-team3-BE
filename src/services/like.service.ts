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
    return;
  }

  try {
    const result = await likeRepository.createLike(postId, userId);

    if (!result) {
      throw new AppError('POST_NOT_FOUND');
    }
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return;
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
    return;
  }

  const result = await likeRepository.deleteLike(postId, userId);

  if (!result.deleted) {
    return;
  }
};
