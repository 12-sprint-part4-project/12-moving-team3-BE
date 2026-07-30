import { Router } from 'express';
import * as adminCompletedController from '../controllers/admin-completed.controller';
import { requireAdminAuth } from '../middlewares/admin-auth.middleware';
import { adminStatisticsFilterSchema } from '../schemas/admin-statistics.schema';
import { validateRequest } from '../middlewares/validate.middleware';

const router = Router();

router.get(
  '/statistics',
  requireAdminAuth,
  validateRequest({
    query: adminStatisticsFilterSchema,
    errorCode: 'ADMIN_INVALID_QUERY_PARAM',
  }),
  adminCompletedController.getCompletedStatistics
);

export default router;
