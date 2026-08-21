import { Router } from 'express';
import * as postController from '../controllers/post.controller';
import { optionalAuth, requireAuth } from '../middlewares/auth.middleware';
import { requireCompletedProfile } from '../middlewares/profile.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import {
  createPostBodySchema,
  postIdParamsSchema,
  postListQuerySchema,
  postNeighborsQuerySchema,
  updatePostBodySchema,
} from '../schemas/post.schema';

const router = Router();

// 게시글 목록 조회 (Swagger: src/docs/community.swagger.yaml)
router.get(
  '/',
  optionalAuth,
  validateRequest({
    query: postListQuerySchema,
    errorCode: 'INVALID_QUERY_PARAM',
  }),
  postController.getPosts
);

// 게시글 이전/다음 조회 (Swagger: src/docs/community.swagger.yaml)
router.get(
  '/:postId/neighbors',
  optionalAuth,
  validateRequest({
    params: postIdParamsSchema,
    query: postNeighborsQuerySchema,
    errorCode: 'INVALID_QUERY_PARAM',
  }),
  postController.getPostNeighbors
);

// 게시글 상세 조회 (Swagger: src/docs/community.swagger.yaml)
router.get(
  '/:postId',
  optionalAuth,
  validateRequest({
    params: postIdParamsSchema,
    errorCode: 'INVALID_REQUEST',
  }),
  postController.getPostById
);

// 게시글 생성 (Swagger: src/docs/community.swagger.yaml)
router.post(
  '/',
  requireAuth,
  requireCompletedProfile,
  validateRequest({ body: createPostBodySchema, errorCode: 'INVALID_REQUEST' }),
  postController.createPost
);

// 게시글 수정 (Swagger: src/docs/community.swagger.yaml)
router.patch(
  '/:postId',
  requireAuth,
  requireCompletedProfile,
  validateRequest({
    params: postIdParamsSchema,
    body: updatePostBodySchema,
    errorCode: 'INVALID_REQUEST',
  }),
  postController.updatePost
);

// 게시글 삭제 (Swagger: src/docs/community.swagger.yaml)
router.delete(
  '/:postId',
  requireAuth,
  requireCompletedProfile,
  validateRequest({ params: postIdParamsSchema, errorCode: 'INVALID_REQUEST' }),
  postController.deletePost
);

// 가구 나눔 완료 처리 (Swagger: src/docs/community.swagger.yaml)
router.patch(
  '/:postId/complete',
  requireAuth,
  requireCompletedProfile,
  validateRequest({ params: postIdParamsSchema, errorCode: 'INVALID_REQUEST' }),
  postController.completePost
);

// 게시글 조회수 증가 (Swagger: src/docs/community.swagger.yaml)
router.post(
  '/:postId/views',
  optionalAuth,
  validateRequest({ params: postIdParamsSchema, errorCode: 'INVALID_REQUEST' }),
  postController.incrementViewCount
);

export default router;
