import { Router } from 'express';
import * as adminReportController from '../controllers/admin-report.controller';
import { requireAdmin } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import {
  adminReportDetailParamsSchema,
  adminReportDetailQuerySchema,
  adminReportListQuerySchema,
  adminReportProcessBodySchema,
} from '../schemas/admin-report.schema';
import { adminStatisticsFilterSchema } from '../schemas/admin-statistics.schema';

const router = Router();

// 신고 목록 조회 (Swagger: src/docs/admin-report.swagger.yaml)
router.get(
  '/',
  requireAdmin,
  validateRequest({
    query: adminReportListQuerySchema,
    errorCode: 'ADMIN_INVALID_QUERY_PARAM',
  }),
  adminReportController.getAdminReportList
);

// 신고 관리 통계 조회 (Swagger: src/docs/admin-report.swagger.yaml)
// `/:reportId`보다 먼저 등록해 "statistics"가 reportId로 잡히지 않게 한다.
router.get(
  '/statistics',
  requireAdmin,
  validateRequest({
    query: adminStatisticsFilterSchema,
    errorCode: 'ADMIN_INVALID_QUERY_PARAM',
  }),
  adminReportController.getReportStatistics
);

// 신고 처리 / 반려 (Swagger: src/docs/admin-report.swagger.yaml)
router.post(
  '/:reportId/resolve',
  requireAdmin,
  validateRequest({
    params: adminReportDetailParamsSchema,
    body: adminReportProcessBodySchema,
    errorCode: 'ADMIN_INVALID_QUERY_PARAM',
  }),
  adminReportController.resolveAdminReport
);

// 신고 반려 — body 없음. Action 스키마를 연결하지 않는다.
router.post(
  '/:reportId/reject',
  requireAdmin,
  validateRequest({
    params: adminReportDetailParamsSchema,
    errorCode: 'ADMIN_INVALID_QUERY_PARAM',
  }),
  adminReportController.rejectAdminReport
);

// 신고 상세 조회 (Swagger: src/docs/admin-report.swagger.yaml)
router.get(
  '/:reportId',
  requireAdmin,
  validateRequest({
    params: adminReportDetailParamsSchema,
    query: adminReportDetailQuerySchema,
    errorCode: 'ADMIN_INVALID_QUERY_PARAM',
  }),
  adminReportController.getAdminReportDetail
);

export default router;
