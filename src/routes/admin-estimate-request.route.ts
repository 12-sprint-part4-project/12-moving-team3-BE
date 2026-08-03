import { Router } from 'express';
import { requireAdminAuth } from '../middlewares/admin-auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import * as adminEstimateRequestController from '../controllers/admin-estimate-request.controller';
import { adminStatisticsFilterSchema } from '../schemas/admin-statistics.schema';
import { adminEstimateRequestListQuerySchema } from '../schemas/admin-estimate-request.schema';

const router = Router();

// 견적 요청 통계 조회 (Swagger: src/docs/admin-estimate-request.swagger.yaml)
router.get(
  '/statistics',
  requireAdminAuth,
  validateRequest({
    query: adminStatisticsFilterSchema,
    errorCode: 'ADMIN_INVALID_QUERY_PARAM',
  }),
  adminEstimateRequestController.getEstimateRequestStatistics
);

router.get(
  '/',
  requireAdminAuth,
  validateRequest({
    query: adminEstimateRequestListQuerySchema,
    errorCode: 'ADMIN_INVALID_QUERY_PARAM',
  }),
  adminEstimateRequestController.getEstimateRequestList
);

export default router;
