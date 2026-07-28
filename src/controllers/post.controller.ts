import type { NextFunction, Request, Response } from 'express';
import {
  getAuthenticatedUser,
  getOptionalAuthenticatedUser,
} from '../middlewares/auth.middleware';
import type {
  CreatePostBody,
  PostIdParams,
  PostListQuery,
  UpdatePostBody,
} from '../schemas/post.schema';
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

/** POST /api/posts — 게시글 생성 */
export const createPost = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = getAuthenticatedUser(res);
    const body = req.body as CreatePostBody;
    const result = await postService.createPost(userId, body);

    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
};

/** PATCH /api/posts/:postId — 게시글 수정 */
export const updatePost = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = getAuthenticatedUser(res);
    const { postId } = getValidatedParams(res);
    const body = req.body as UpdatePostBody;
    const result = await postService.updatePost(postId, userId, body);

    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/posts/:postId — 게시글 삭제 */
export const deletePost = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = getAuthenticatedUser(res);
    const { postId } = getValidatedParams(res);
    await postService.deletePost(postId, userId);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
