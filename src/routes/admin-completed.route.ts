import { Router } from 'express';
import * as adminCompletedController from '../controllers/admin-completed.controller';
import { requireAdmin } from '../middlewares/auth.middleware';
import { adminStatisticsFilterSchema } from '../schemas/admin-statistics.schema';
import { validateRequest } from '../middlewares/validate.middleware';
import {
  adminCompletedDetailQuerySchema,
  adminCompletedListQuerySchema,
} from '../schemas/admin-estimate-request.schema';
import { estimateRequestIdParamsSchema } from '../schemas/estimate-request.schema';

const router = Router();

// 완료 견적 요청 통계 조회 (Swagger: src/docs/admin-completed.swagger.yaml)
router.get(
  '/statistics',
  requireAdmin,
  validateRequest({
    query: adminStatisticsFilterSchema,
    errorCode: 'ADMIN_INVALID_QUERY_PARAM',
  }),
  adminCompletedController.getCompletedStatistics
);

// 완료 견적 요청 목록 조회 (Swagger: src/docs/admin-completed.swagger.yaml)
router.get(
  '/',
  requireAdmin,
  validateRequest({
    query: adminCompletedListQuerySchema,
    errorCode: 'ADMIN_INVALID_QUERY_PARAM',
  }),
  adminCompletedController.getCompletedList
);

// 완료 견적 요청 상세 조회 (Swagger: src/docs/admin-completed.swagger.yaml)
router.get(
  '/:estimateRequestId',
  requireAdmin,
  validateRequest({
    params: estimateRequestIdParamsSchema,
    query: adminCompletedDetailQuerySchema,
    errorCode: 'ADMIN_INVALID_QUERY_PARAM',
  }),
  adminCompletedController.getCompletedRequestDetail
);

export default router;
