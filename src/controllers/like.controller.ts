import type { NextFunction, Request, Response } from 'express';
import { getAuthenticatedUser } from '../middlewares/auth.middleware';
import type { PostIdParams } from '../schemas/post.schema';
import * as likeService from '../services/like.service';
import { getValidated } from '../utils/validated.util';

/** POST /api/posts/:postId/likes — 좋아요 추가 */
export const createLike = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = getAuthenticatedUser(res);
    const { postId } = getValidated<PostIdParams>(res, 'params');

    await likeService.createLike(postId, userId);

    res.status(201).json({ data: null });
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/posts/:postId/likes — 좋아요 취소 */
export const deleteLike = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = getAuthenticatedUser(res);
    const { postId } = getValidated<PostIdParams>(res, 'params');

    await likeService.deleteLike(postId, userId);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
