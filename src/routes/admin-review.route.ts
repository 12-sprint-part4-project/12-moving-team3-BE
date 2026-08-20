import { Router } from 'express';
import * as adminReviewController from '../controllers/admin-review.controller';
import { requireAdmin } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import {
  adminReviewListQuerySchema,
  adminReviewParamsSchema,
} from '../schemas/admin-review.schema';
import { adminStatisticsFilterSchema } from '../schemas/admin-statistics.schema';

const router = Router();

// 리뷰 목록 조회 — `/statistics`보다 먼저 등록할 필요는 없지만 목록을 기본 경로로 둔다
router.get(
  '/',
  requireAdmin,
  validateRequest({
    query: adminReviewListQuerySchema,
    errorCode: 'ADMIN_INVALID_QUERY_PARAM',
  }),
  adminReviewController.getAdminReviewList
);

// 리뷰 관리 통계 조회 (Swagger: src/docs/admin-review.swagger.yaml)
router.get(
  '/statistics',
  requireAdmin,
  validateRequest({
    query: adminStatisticsFilterSchema,
    errorCode: 'ADMIN_INVALID_QUERY_PARAM',
  }),
  adminReviewController.getReviewStatistics
);

// 리뷰 soft delete — `/:reviewId`가 statistics 등으로 잡히지 않게 통계 라우트 뒤에 둔다
router.delete(
  '/:reviewId',
  requireAdmin,
  validateRequest({
    params: adminReviewParamsSchema,
    errorCode: 'ADMIN_INVALID_QUERY_PARAM',
  }),
  adminReviewController.deleteAdminReview
);

export default router;
