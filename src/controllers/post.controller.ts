import type { NextFunction, Request, Response } from 'express';
import {
  getAuthenticatedUser,
  getOptionalAuthenticatedUser,
} from '../middlewares/auth.middleware';
import type {
  CreatePostBody,
  PostIdParams,
  PostListQuery,
  PresignedUrlBody,
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

const getValidatedCreateBody = (res: Response): CreatePostBody => {
  const body = res.locals.validated?.body;

  if (body == null || typeof body !== 'object') {
    throw new AppError('INVALID_REQUEST');
  }

  return body as CreatePostBody;
};

const getValidatedUpdateBody = (res: Response): UpdatePostBody => {
  const body = res.locals.validated?.body;

  if (body == null || typeof body !== 'object') {
    throw new AppError('INVALID_REQUEST');
  }

  return body as UpdatePostBody;
};

const getValidatedPresignedUrlBody = (res: Response): PresignedUrlBody => {
  const body = res.locals.validated?.body;

  if (body == null || typeof body !== 'object') {
    throw new AppError('INVALID_REQUEST');
  }

  return body as PresignedUrlBody;
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
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = getAuthenticatedUser(res);
    const body = getValidatedCreateBody(res);
    const result = await postService.createPost(userId, body);

    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
};

/** PATCH /api/posts/:postId — 게시글 수정 */
export const updatePost = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = getAuthenticatedUser(res);
    const { postId } = getValidatedParams(res);
    const body = getValidatedUpdateBody(res);
    const result = await postService.updatePost(postId, userId, body);

    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
};

/** POST /api/posts/image/presigned-url — 이미지 업로드 Presigned URL 발급 */
export const getPresignedUrl = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    getAuthenticatedUser(res);

    const { contentType } = getValidatedPresignedUrlBody(res);
    const result = await postService.getPresignedUrl(contentType);

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
