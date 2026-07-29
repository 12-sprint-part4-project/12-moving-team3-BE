import { prisma } from '../lib/prisma';

/** 댓글 단건 조회 (soft delete 제외) */
export const findCommentById = async (commentId: number) => {
  return prisma.comment.findFirst({
    where: { id: commentId, deletedAt: null },
    select: { id: true, postId: true, userId: true, parentId: true },
  });
};

/** 댓글/대댓글 생성 + commentCount 증가 (트랜잭션) */
export const createComment = async (
  postId: number,
  userId: string,
  content: string,
  parentId?: number
) => {
  return prisma.$transaction(async (tx) => {
    const postResult = await tx.post.updateMany({
      where: { id: postId, deletedAt: null },
      data: { commentCount: { increment: 1 } },
    });

    if (postResult.count === 0) {
      return null;
    }

    return tx.comment.create({
      data: { postId, userId, content, parentId: parentId ?? null },
      select: { id: true },
    });
  });
};

/**
 * 댓글 soft delete + commentCount 감소 (트랜잭션)
 * 댓글 삭제 시 해당 댓글의 대댓글도 함께 soft delete
 */
export const softDeleteComment = async (commentId: number, postId: number) => {
  return prisma.$transaction(async (tx) => {
    const replies = await tx.comment.findMany({
      where: { parentId: commentId, deletedAt: null },
      select: { id: true },
    });

    const idsToDelete = [commentId, ...replies.map((r) => r.id)];

    const deleteResult = await tx.comment.updateMany({
      where: { id: { in: idsToDelete }, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    if (deleteResult.count === 0) {
      return { count: 0 };
    }

    await tx.post.updateMany({
      where: { id: postId, deletedAt: null },
      data: { commentCount: { decrement: deleteResult.count } },
    });

    return { count: deleteResult.count };
  });
};
