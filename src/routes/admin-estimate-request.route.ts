import { Router } from 'express';
import { requireAdminAuth } from '../middlewares/admin-auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import { adminEstimateRequestStatisticsQuerySchema } from '../schemas/admin-estimate-request.schema';
import * as adminEstimateRequestController from '../controllers/admin-estimate-request.controller';

const router = Router();

router.get(
  '/statistics',
  requireAdminAuth,
  validateRequest({
    query: adminEstimateRequestStatisticsQuerySchema,
    errorCode: 'ADMIN_INVALID_QUERY_PARAM',
  }),
  adminEstimateRequestController.getEstimateRequestStatistics
);

export default router;
