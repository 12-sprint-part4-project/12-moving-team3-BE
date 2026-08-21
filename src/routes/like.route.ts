import { Router } from 'express';
import * as likeController from '../controllers/like.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import { requireCompletedProfile } from '../middlewares/profile.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import { postIdParamsSchema } from '../schemas/post.schema';

const router = Router();

// 좋아요 등록 (Swagger: src/docs/community.swagger.yaml)
router.post(
  '/:postId/likes',
  requireAuth,
  requireCompletedProfile,
  validateRequest({ params: postIdParamsSchema, errorCode: 'INVALID_REQUEST' }),
  likeController.createLike
);

// 좋아요 취소 (Swagger: src/docs/community.swagger.yaml)
router.delete(
  '/:postId/likes',
  requireAuth,
  requireCompletedProfile,
  validateRequest({ params: postIdParamsSchema, errorCode: 'INVALID_REQUEST' }),
  likeController.deleteLike
);

export default router;
