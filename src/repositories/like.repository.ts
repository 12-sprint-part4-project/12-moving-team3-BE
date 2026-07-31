import { prisma } from '../lib/prisma';

/** 좋아요 존재 여부 확인 */
export const findLike = async (postId: number, userId: string) => {
  return prisma.postLike.findUnique({
    where: { postId_userId: { postId, userId } },
    select: { id: true },
  });
};

/** 좋아요 생성 + likeCount 증가 (트랜잭션). post 미존재 시 null. */
export const createLike = async (postId: number, userId: string) => {
  return prisma.$transaction(async (tx) => {
    const postResult = await tx.post.updateMany({
      where: { id: postId, deletedAt: null },
      data: { likeCount: { increment: 1 } },
    });

    if (postResult.count === 0) {
      return null;
    }

    return tx.postLike.create({
      data: { postId, userId },
      select: { id: true },
    });
  });
};

/** 좋아요 삭제 + likeCount 감소 (트랜잭션). 삭제된 row가 없으면 deleted: false. */
export const deleteLike = async (postId: number, userId: string) => {
  return prisma.$transaction(async (tx) => {
    const deleteResult = await tx.postLike.deleteMany({
      where: { postId, userId },
    });

    if (deleteResult.count === 0) {
      return { deleted: false as const };
    }

    await tx.post.updateMany({
      where: { id: postId, deletedAt: null },
      data: { likeCount: { decrement: 1 } },
    });

    return { deleted: true as const };
  });
};
