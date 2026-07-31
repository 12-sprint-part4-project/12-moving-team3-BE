import { Router } from 'express';
import { validateRequest } from '../middlewares/validate.middleware';
import { requireAdminAuth } from '../middlewares/admin-auth.middleware';
import * as adminDashboardController from '../controllers/admin-dashboard.controller';
import { adminDashboardRequestTrendFilterSchema } from '../schemas/admin-dashboard.schema';
import { adminStatisticsFilterSchema } from '../schemas/admin-statistics.schema';
const router = Router();

// 관리자 대시보드 통계 조회 (Swagger: src/docs/admin-dashboard.swagger.yaml)
router.get(
  '/statistics',
  requireAdminAuth,
  validateRequest({
    query: adminStatisticsFilterSchema,
    errorCode: 'ADMIN_INVALID_QUERY_PARAM',
  }),
  adminDashboardController.getStatistics
);

router.get(
  '/charts/request-trend',
  requireAdminAuth,
  validateRequest({
    query: adminDashboardRequestTrendFilterSchema,
    errorCode: 'ADMIN_INVALID_QUERY_PARAM',
  }),
  adminDashboardController.getRequestTrend
);

router.get(
  '/charts/request-status',
  requireAdminAuth,
  adminDashboardController.getRequestStatus
);

export default router;
