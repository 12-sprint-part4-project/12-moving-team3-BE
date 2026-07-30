import { Router } from 'express';
import { validateRequest } from '../middlewares/validate.middleware';
import { adminDashboardStatisticsQuerySchema } from '../schemas/admin-dashboard.schema';
import { requireAdminAuth } from '../middlewares/admin-auth.middleware';
import * as adminDashboardController from '../controllers/admin-dashboard.controller';

const router = Router();

// 관리자 대시보드 통계 조회 (Swagger: src/docs/admin-dashboard.swagger.yaml)
router.get(
  '/statistics',
  requireAdminAuth,
  validateRequest({
    query: adminDashboardStatisticsQuerySchema,
    errorCode: 'ADMIN_INVALID_QUERY_PARAM',
  }),
  adminDashboardController.getStatistics
);

export default router;
