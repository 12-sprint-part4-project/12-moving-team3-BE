import { Router } from 'express';
import { requireAdminAuth } from '../middlewares/admin-auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import * as adminEstimateRequestController from '../controllers/admin-estimate-request.controller';
import { adminStatisticsFilterSchema } from '../schemas/admin-statistics.schema';

const router = Router();

router.get(
  '/statistics',
  requireAdminAuth,
  validateRequest({
    query: adminStatisticsFilterSchema,
    errorCode: 'ADMIN_INVALID_QUERY_PARAM',
  }),
  adminEstimateRequestController.getEstimateRequestStatistics
);

export default router;
