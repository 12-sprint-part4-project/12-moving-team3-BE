import type { NextFunction, Request, Response } from 'express';
import { getOptionalAuthenticatedUser } from '../middlewares/auth.middleware';
import type { PostIdParams, PostListQuery } from '../schemas/post.schema';
import * as postService from '../services/post.service';
import { AppError } from '../utils/app.error';

const getValidatedListQuery = (res: Response): PostListQuery => {
  const query = res.locals.validated?.query;

  if (query == null || typeof query !== 'object') {
    throw new AppError('INVALID_QUERY_PARAM');
  }

  return query as PostListQuery;
};

const getValidatedParams = (res: Response): PostIdParams => {
  const params = res.locals.validated?.params;

  if (params == null || typeof params !== 'object') {
    throw new AppError('INVALID_REQUEST');
  }

  return params as PostIdParams;
};

/** GET /api/posts — 게시글 목록 조회 */
export const getPosts = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = getOptionalAuthenticatedUser(res)?.userId;
    const query = getValidatedListQuery(res);
    const result = await postService.getPosts(query, userId);

    res.status(200).json({
      data: { items: result.items },
      meta: result.meta,
    });
  } catch (error) {
    next(error);
  }
};

/** GET /api/posts/:postId — 게시글 상세 조회 */
export const getPostById = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = getOptionalAuthenticatedUser(res)?.userId;
    const { postId } = getValidatedParams(res);
    const result = await postService.getPostById(postId, userId);

    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
};
