import { prisma } from '../lib/prisma';

/** 좋아요 존재 여부 확인 */
export const findLike = async (postId: number, userId: string) => {
  return prisma.postLike.findUnique({
    where: { postId_userId: { postId, userId } },
    select: { id: true },
  });
};

/** 좋아요 생성 + likeCount 증가 (트랜잭션). post 미존재 시 null (트랜잭션 롤백). */
export const createLike = async (postId: number, userId: string) => {
  try {
    return await prisma.$transaction(async (tx) => {
      const like = await tx.postLike.create({
        data: { postId, userId },
        select: { id: true },
      });

      const postResult = await tx.post.updateMany({
        where: { id: postId, deletedAt: null },
        data: { likeCount: { increment: 1 } },
      });

      if (postResult.count === 0) {
        throw new Error('POST_NOT_FOUND');
      }

      return like;
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'POST_NOT_FOUND') {
      return null;
    }

    throw error;
  }
};

/** 좋아요 삭제 + likeCount 감소 (트랜잭션) */
export const deleteLike = async (postId: number, userId: string) => {
  return prisma.$transaction(async (tx) => {
    await tx.postLike.delete({
      where: { postId_userId: { postId, userId } },
    });

    await tx.post.updateMany({
      where: { id: postId, deletedAt: null },
      data: { likeCount: { decrement: 1 } },
    });
  });
};
