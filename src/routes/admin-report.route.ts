import { Router } from 'express';
import * as adminReportController from '../controllers/admin-report.controller';
import { requireAdminAuth } from '../middlewares/admin-auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import { adminStatisticsFilterSchema } from '../schemas/admin-statistics.schema';

const router = Router();

// 신고 목록 조회 (Swagger: src/docs/admin-report.swagger.yaml)
router.get('/', requireAdminAuth, adminReportController.getAdminReportList);

// 신고 관리 통계 조회 (Swagger: src/docs/admin-report.swagger.yaml)
router.get(
  '/statistics',
  requireAdminAuth,
  validateRequest({
    query: adminStatisticsFilterSchema,
    errorCode: 'ADMIN_INVALID_QUERY_PARAM',
  }),
  adminReportController.getReportStatistics
);

export default router;
