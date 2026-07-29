import * as commentRepository from '../repositories/comment.repository';
import * as postRepository from '../repositories/post.repository';
import { AppError } from '../utils/app.error';

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
    throw new AppError('POST_NOT_FOUND');
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

  const result = await commentRepository.softDeleteComment(
    commentId,
    postId
  );

  if (result.count === 0) {
    throw new AppError('COMMENT_NOT_FOUND');
  }
};
