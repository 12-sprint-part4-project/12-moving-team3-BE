import { Router } from 'express';
import * as adminCompletedController from '../controllers/admin-completed.controller';
import { requireAdminAuth } from '../middlewares/admin-auth.middleware';
import { adminStatisticsFilterSchema } from '../schemas/admin-statistics.schema';
import { validateRequest } from '../middlewares/validate.middleware';
import { adminCompletedListQuerySchema } from '../schemas/admin-estimate-request.schema';

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

// 완료 견적 요청 목록 조회 (Swagger: src/docs/admin-completed.swagger.yaml)
router.get(
  '/',
  requireAdminAuth,
  validateRequest({
    query: adminCompletedListQuerySchema,
    errorCode: 'ADMIN_INVALID_QUERY_PARAM',
  }),
  adminCompletedController.getCompletedList
);

export default router;
