import { Router } from 'express';
import { requireAdminAuth } from '../middlewares/admin-auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import * as adminReviewController from '../controllers/admin-review.controller';
import { adminStatisticsFilterSchema } from '../schemas/admin-statistics.schema';

const router = Router();

// 리뷰 관리 통계 조회
router.get(
  '/statistics',
  requireAdminAuth,
  validateRequest({
    query: adminStatisticsFilterSchema,
    errorCode: 'ADMIN_INVALID_QUERY_PARAM',
  }),
  adminReviewController.getReviewStatistics
);

export default router;
