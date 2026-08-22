import { Router } from 'express';
import * as commentController from '../controllers/comment.controller';
import { optionalAuth, requireAuth } from '../middlewares/auth.middleware';
import { requireCompletedProfile } from '../middlewares/profile.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import {
  commentIdParamsSchema,
  commentListQuerySchema,
  createCommentBodySchema,
  postIdParamsSchema,
} from '../schemas/post.schema';

const router = Router();

// 댓글 목록 조회 (Swagger: src/docs/community.swagger.yaml)
router.get(
  '/:postId/comments',
  optionalAuth,
  validateRequest({
    params: postIdParamsSchema,
    query: commentListQuerySchema,
    errorCode: 'INVALID_QUERY_PARAM',
  }),
  commentController.getComments
);

// 댓글 생성 (Swagger: src/docs/community.swagger.yaml)
router.post(
  '/:postId/comments',
  requireAuth,
  requireCompletedProfile,
  validateRequest({
    params: postIdParamsSchema,
    body: createCommentBodySchema,
    errorCode: 'INVALID_REQUEST',
  }),
  commentController.createComment
);

// 대댓글 생성 (Swagger: src/docs/community.swagger.yaml)
router.post(
  '/:postId/comments/:commentId/replies',
  requireAuth,
  requireCompletedProfile,
  validateRequest({
    params: commentIdParamsSchema,
    body: createCommentBodySchema,
    errorCode: 'INVALID_REQUEST',
  }),
  commentController.createReply
);

// 댓글/대댓글 삭제 (Swagger: src/docs/community.swagger.yaml)
router.delete(
  '/:postId/comments/:commentId',
  requireAuth,
  requireCompletedProfile,
  validateRequest({
    params: commentIdParamsSchema,
    errorCode: 'INVALID_REQUEST',
  }),
  commentController.deleteComment
);

export default router;
