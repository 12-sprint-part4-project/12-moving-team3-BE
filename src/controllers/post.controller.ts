import type { NextFunction, Request, Response } from 'express';
import {
  getAuthenticatedUser,
  getOptionalAuthenticatedUser,
} from '../middlewares/auth.middleware';
import type {
  CreatePostBody,
  PostIdParams,
  PostListQuery,
  PostNeighborsQuery,
  UpdatePostBody,
} from '../schemas/post.schema';
import * as postService from '../services/post.service';
import { getValidated } from '../utils/validated.util';

/** GET /api/posts — 게시글 목록 조회 */
export const getPosts = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = getOptionalAuthenticatedUser(res)?.userId;
    const query = getValidated<PostListQuery>(res, 'query');
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
    const { postId } = getValidated<PostIdParams>(res, 'params');
    const result = await postService.getPostById(postId, userId);

    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
};

/** GET /api/posts/:postId/neighbors — 게시글 이전/다음 조회 */
export const getPostNeighbors = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { postId } = getValidated<PostIdParams>(res, 'params');
    const query = getValidated<PostNeighborsQuery>(res, 'query');
    const result = await postService.getPostNeighbors(postId, query);

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
    const body = getValidated<CreatePostBody>(res, 'body');
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
    const { postId } = getValidated<PostIdParams>(res, 'params');
    const body = getValidated<UpdatePostBody>(res, 'body');
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
    const { postId } = getValidated<PostIdParams>(res, 'params');
    await postService.deletePost(postId, userId);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

/** POST /api/posts/:postId/views — 게시글 조회수 +1 */
export const incrementViewCount = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { postId } = getValidated<PostIdParams>(res, 'params');
    await postService.incrementViewCount(postId);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
