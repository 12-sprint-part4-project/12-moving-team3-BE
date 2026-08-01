import type { CommentListQuery } from '../schemas/post.schema';
import * as commentRepository from '../repositories/comment.repository';
import type { CommentCursor } from '../repositories/comment.repository';
import * as postRepository from '../repositories/post.repository';
import { AppError } from '../utils/app.error';
import { toPresignedViewUrl } from './s3.service';

const isCommentCursor = (value: unknown): value is CommentCursor => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    Number.isInteger(record.id) &&
    (record.id as number) > 0 &&
    typeof record.value === 'string' &&
    record.value.length > 0
  );
};

const encodeCursor = (cursor: CommentCursor): string =>
  Buffer.from(JSON.stringify(cursor), 'utf-8').toString('base64url');

const assertIsoDateCursorValue = (value: string): void => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    throw new AppError('INVALID_QUERY_PARAM');
  }
};

const decodeCursor = (cursor: string): CommentCursor => {
  let decoded: unknown;

  try {
    decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8'));
  } catch {
    throw new AppError('INVALID_QUERY_PARAM');
  }

  if (!isCommentCursor(decoded)) {
    throw new AppError('INVALID_QUERY_PARAM');
  }

  assertIsoDateCursorValue(decoded.value);

  return decoded;
};

const mapAuthor = async (user: {
  id: string;
  nickname: string;
  profileImageKey: string | null;
}) => ({
  id: user.id,
  nickname: user.nickname,
  profileImageUrl: await toPresignedViewUrl(user.profileImageKey),
});

const mapCommentItem = async (
  comment: {
    id: number;
    userId: string;
    content: string;
    createdAt: Date;
    user: {
      id: string;
      nickname: string;
      profileImageKey: string | null;
    };
  },
  userId?: string
) => ({
  id: comment.id,
  content: comment.content,
  author: await mapAuthor(comment.user),
  isMine: userId ? comment.userId === userId : null,
  createdAt: comment.createdAt,
});

/** 게시글 댓글 목록 (최상위 댓글 + 대댓글, 커서 페이지네이션) */
export const getComments = async (
  postId: number,
  query: CommentListQuery,
  userId?: string
) => {
  const post = await postRepository.findPostOwner(postId);

  if (!post) {
    throw new AppError('POST_NOT_FOUND');
  }

  const { limit } = query;
  const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;

  const rows = await commentRepository.findTopLevelComments(
    postId,
    limit,
    cursor
  );

  const hasNextPage = rows.length > limit;
  const topLevel = hasNextPage ? rows.slice(0, limit) : rows;
  const parentIds = topLevel.map((comment) => comment.id);

  const replyRows = await commentRepository.findRepliesByParentIds(
    postId,
    parentIds
  );

  const repliesByParentId = new Map<number, typeof replyRows>();

  for (const reply of replyRows) {
    if (reply.parentId == null) {
      continue;
    }

    const existing = repliesByParentId.get(reply.parentId) ?? [];
    existing.push(reply);
    repliesByParentId.set(reply.parentId, existing);
  }

  const items = await Promise.all(
    topLevel.map(async (comment) => ({
      ...(await mapCommentItem(comment, userId)),
      replies: await Promise.all(
        (repliesByParentId.get(comment.id) ?? []).map((reply) =>
          mapCommentItem(reply, userId)
        )
      ),
    }))
  );

  const lastRow =
    topLevel.length > 0 ? topLevel[topLevel.length - 1] : undefined;

  return {
    items,
    meta: {
      nextCursor:
        hasNextPage && lastRow
          ? encodeCursor({
              id: lastRow.id,
              value: lastRow.createdAt.toISOString(),
            })
          : null,
      hasNextPage,
    },
  };
};

/** 댓글 작성 */
export const createComment = async (
  postId: number,
  userId: string,
  content: string
) => {
  const post = await postRepository.findPostOwner(postId);

  if (!post) {
    throw new AppError('POST_NOT_FOUND');
  }

  const comment = await commentRepository.createComment(
    postId,
    userId,
    content
  );

  if (!comment) {
    throw new AppError('POST_NOT_FOUND');
  }

  return { id: comment.id };
};

/** 대댓글 작성 */
export const createReply = async (
  postId: number,
  commentId: number,
  userId: string,
  content: string
) => {
  const post = await postRepository.findPostOwner(postId);

  if (!post) {
    throw new AppError('POST_NOT_FOUND');
  }

  const parentComment = await commentRepository.findCommentById(commentId);

  if (!parentComment) {
    throw new AppError('COMMENT_NOT_FOUND');
  }

  if (parentComment.postId !== postId) {
    throw new AppError('COMMENT_NOT_FOUND');
  }

  // 대댓글에 대댓글 불가 (depth 1 제한)
  if (parentComment.parentId !== null) {
    throw new AppError('REPLY_DEPTH_EXCEEDED');
  }

  const reply = await commentRepository.createComment(
    postId,
    userId,
    content,
    commentId
  );

  if (!reply) {
    throw new AppError('COMMENT_NOT_FOUND');
  }

  return { id: reply.id };
};

/** 댓글 삭제 (soft delete, 대댓글 포함) */
export const deleteComment = async (
  postId: number,
  commentId: number,
  userId: string
) => {
  const comment = await commentRepository.findCommentById(commentId);

  if (!comment) {
    throw new AppError('COMMENT_NOT_FOUND');
  }

  if (comment.postId !== postId) {
    throw new AppError('COMMENT_NOT_FOUND');
  }

  if (comment.userId !== userId) {
    throw new AppError('COMMENT_FORBIDDEN');
  }

  const result = await commentRepository.softDeleteComment(commentId, postId);

  if (result.count === 0) {
    throw new AppError('COMMENT_NOT_FOUND');
  }
};
