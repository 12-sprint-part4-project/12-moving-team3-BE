import { z } from 'zod';
import { adminStatisticsFilterSchema } from './admin-statistics.schema';
import { listQuerySchema } from './admin-list-query.schema';
import { EstimateRequestStatus } from '@prisma/client';

export const estimateRequestManageStatusSchema = z.enum([
  EstimateRequestStatus.SUBMITTED,
  EstimateRequestStatus.CONFIRMED,
]);

export const adminEstimateRequestListQuerySchema = listQuerySchema
  .extend({
    status: estimateRequestManageStatusSchema.optional(),
  })
  .and(adminStatisticsFilterSchema);

export type AdminEstimateRequestListQuery = z.infer<
  typeof adminEstimateRequestListQuerySchema
>;
