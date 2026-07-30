import { Router } from 'express';
import { validateRequest } from '../middlewares/validate.middleware';
import { adminDashboardStatisticsQuerySchema } from '../schemas/admin-dashboard.schema';
import { requireAdminAuth } from '../middlewares/admin-auth.middleware';
import { adminDashboardController } from '../controllers/admin-dashboard.controller';

const router = Router();

router.get(
  '/dashboard/statistics',
  requireAdminAuth,
  validateRequest({
    query: adminDashboardStatisticsQuerySchema,
    errorCode: 'ADMIN_INVALID_QUERY_PARAM',
  }),
  adminDashboardController.getStatistics
);

export default router;
