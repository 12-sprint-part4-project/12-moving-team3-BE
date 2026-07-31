import { Router } from 'express';
import * as adminCompletedController from '../controllers/admin-completed.controller';
import { requireAdminAuth } from '../middlewares/admin-auth.middleware';
import { adminStatisticsFilterSchema } from '../schemas/admin-statistics.schema';
import { validateRequest } from '../middlewares/validate.middleware';

const router = Router();

// 완료 견적 요청 통계 조회 (Swagger: src/docs/admin-completed.swagger.yaml)
router.get(
  '/statistics',
  requireAdminAuth,
  validateRequest({
    query: adminStatisticsFilterSchema,
    errorCode: 'ADMIN_INVALID_QUERY_PARAM',
  }),
  adminCompletedController.getCompletedStatistics
);

export default router;
