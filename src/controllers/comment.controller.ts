import type { NextFunction, Request, Response } from 'express';
import {
  getAuthenticatedUser,
  getOptionalAuthenticatedUser,
} from '../middlewares/auth.middleware';
import type {
  CommentIdParams,
  CommentListQuery,
  CreateCommentBody,
  PostIdParams,
} from '../schemas/post.schema';
import * as commentService from '../services/comment.service';
import { getValidated } from '../utils/validated.util';

/** GET /api/posts/:postId/comments — 댓글 목록 조회 */
export const getComments = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = getOptionalAuthenticatedUser(res)?.userId;
    const { postId } = getValidated<PostIdParams>(res, 'params');
    const query = getValidated<CommentListQuery>(res, 'query');
    const result = await commentService.getComments(postId, query, userId);

    res.status(200).json({
      data: { items: result.items },
      meta: result.meta,
    });
  } catch (error) {
    next(error);
  }
};

/** POST /api/posts/:postId/comments — 댓글 작성 */
export const createComment = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = getAuthenticatedUser(res);
    const { postId } = getValidated<PostIdParams>(res, 'params');
    const { content } = getValidated<CreateCommentBody>(res, 'body');

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
    const { postId, commentId } = getValidated<CommentIdParams>(res, 'params');
    const { content } = getValidated<CreateCommentBody>(res, 'body');

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
    const { postId, commentId } = getValidated<CommentIdParams>(res, 'params');

    await commentService.deleteComment(postId, commentId, userId);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
