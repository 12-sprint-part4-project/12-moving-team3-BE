import { prisma } from '../lib/prisma';
import type { Prisma } from '@prisma/client';

export interface CommentCursor {
  id: number;
  value: string;
}

/** 댓글 단건 조회 (soft delete 제외) */
export const findCommentById = async (commentId: number) => {
  return prisma.comment.findFirst({
    where: { id: commentId, deletedAt: null },
    select: { id: true, postId: true, userId: true, parentId: true },
  });
};

const commentAuthorSelect = {
  id: true,
  nickname: true,
  profileImageKey: true,
} as const;

type CommentRow = Prisma.CommentGetPayload<{
  select: {
    id: true;
    userId: true;
    content: true;
    createdAt: true;
    user: { select: typeof commentAuthorSelect };
  };
}>;

type ReplyRow = CommentRow &
  Prisma.CommentGetPayload<{
    select: { parentId: true };
  }>;

/** 최상위 댓글 키셋 커서 (createdAt asc, id asc) */
const buildTopLevelCursorCondition = (
  cursor: CommentCursor
): Prisma.CommentWhereInput => {
  const createdAt = new Date(cursor.value);

  return {
    OR: [
      { createdAt: { gt: createdAt } },
      { createdAt, id: { gt: cursor.id } },
    ],
  };
};

/** 게시글 최상위 댓글 목록 (limit+1) */
export const findTopLevelComments = async (
  postId: number,
  limit: number,
  cursor?: CommentCursor
): Promise<CommentRow[]> => {
  const baseWhere: Prisma.CommentWhereInput = {
    postId,
    parentId: null,
    deletedAt: null,
  };

  const where: Prisma.CommentWhereInput = cursor
    ? { AND: [baseWhere, buildTopLevelCursorCondition(cursor)] }
    : baseWhere;

  return prisma.comment.findMany({
    where,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: limit + 1,
    select: {
      id: true,
      userId: true,
      content: true,
      createdAt: true,
      user: { select: commentAuthorSelect },
    },
  });
};

/** 최상위 댓글 id 목록에 속한 대댓글 전체 조회 */
export const findRepliesByParentIds = async (
  postId: number,
  parentIds: number[]
): Promise<ReplyRow[]> => {
  if (parentIds.length === 0) {
    return [];
  }

  return prisma.comment.findMany({
    where: {
      postId,
      parentId: { in: parentIds },
      deletedAt: null,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      userId: true,
      parentId: true,
      content: true,
      createdAt: true,
      user: { select: commentAuthorSelect },
    },
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
    if (parentId != null) {
      const parent = await tx.comment.findFirst({
        where: { id: parentId, postId, deletedAt: null },
        select: { id: true },
      });

      if (!parent) {
        return null;
      }
    }

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
    const deleteResult = await tx.comment.updateMany({
      where: {
        postId,
        deletedAt: null,
        OR: [{ id: commentId }, { parentId: commentId }],
      },
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
