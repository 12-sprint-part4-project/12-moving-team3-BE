import type { NextFunction, Request, Response } from 'express';
import { getAuthenticatedUser } from '../middlewares/auth.middleware';
import type {
  CommentIdParams,
  CreateCommentBody,
  PostIdParams,
} from '../schemas/post.schema';
import * as commentService from '../services/comment.service';
import { AppError } from '../utils/app.error';

const getValidatedPostIdParams = (res: Response): PostIdParams => {
  const params = res.locals.validated?.params;

  if (params == null || typeof params !== 'object') {
    throw new AppError('INVALID_REQUEST');
  }

  return params as PostIdParams;
};

const getValidatedCommentIdParams = (res: Response): CommentIdParams => {
  const params = res.locals.validated?.params;

  if (params == null || typeof params !== 'object') {
    throw new AppError('INVALID_REQUEST');
  }

  return params as CommentIdParams;
};

const getValidatedBody = (res: Response): CreateCommentBody => {
  const body = res.locals.validated?.body;

  if (body == null || typeof body !== 'object') {
    throw new AppError('INVALID_REQUEST');
  }

  return body as CreateCommentBody;
};

/** POST /api/posts/:postId/comments — 댓글 작성 */
export const createComment = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = getAuthenticatedUser(res);
    const { postId } = getValidatedPostIdParams(res);
    const { content } = getValidatedBody(res);

    const result = await commentService.createComment(postId, userId, content);

    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
};

/** POST /api/posts/:postId/comments/:commentId/replies — 대댓글 작성 */
export const createReply = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = getAuthenticatedUser(res);
    const { postId, commentId } = getValidatedCommentIdParams(res);
    const { content } = getValidatedBody(res);

    const result = await commentService.createReply(
      postId,
      commentId,
      userId,
      content
    );

    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/posts/:postId/comments/:commentId — 댓글 삭제 */
export const deleteComment = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = getAuthenticatedUser(res);
    const { postId, commentId } = getValidatedCommentIdParams(res);

    await commentService.deleteComment(postId, commentId, userId);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
