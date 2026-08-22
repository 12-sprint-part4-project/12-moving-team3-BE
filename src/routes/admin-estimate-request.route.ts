import { Router } from 'express';
import { requireAdmin } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import * as adminEstimateRequestController from '../controllers/admin-estimate-request.controller';
import { adminStatisticsFilterSchema } from '../schemas/admin-statistics.schema';
import {
  adminEstimateRequestDetailQuerySchema,
  adminEstimateRequestListQuerySchema,
} from '../schemas/admin-estimate-request.schema';
import { estimateRequestIdParamsSchema } from '../schemas/estimate-request.schema';

const router = Router();

// 견적 요청 통계 조회 (Swagger: src/docs/admin-estimate-request.swagger.yaml)
router.get(
  '/statistics',
  requireAdmin,
  validateRequest({
    query: adminStatisticsFilterSchema,
    errorCode: 'ADMIN_INVALID_QUERY_PARAM',
  }),
  adminEstimateRequestController.getEstimateRequestStatistics
);

// 견적 요청 목록 조회 (Swagger: src/docs/admin-estimate-request.swagger.yaml)
router.get(
  '/',
  requireAdmin,
  validateRequest({
    query: adminEstimateRequestListQuerySchema,
    errorCode: 'ADMIN_INVALID_QUERY_PARAM',
  }),
  adminEstimateRequestController.getEstimateRequestList
);

// 견적 요청 상세 조회 (Swagger: src/docs/admin-estimate-request.swagger.yaml)
router.get(
  '/:estimateRequestId',
  requireAdmin,
  validateRequest({
    params: estimateRequestIdParamsSchema,
    query: adminEstimateRequestDetailQuerySchema,
    errorCode: 'ADMIN_INVALID_QUERY_PARAM',
  }),
  adminEstimateRequestController.getEstimateRequestDetail
);

export default router;
