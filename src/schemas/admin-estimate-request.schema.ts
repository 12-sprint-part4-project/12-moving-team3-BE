import { z } from 'zod';
import { adminStatisticsFilterSchema } from './admin-statistics.schema.js';

export const adminEstimateRequestListQuerySchema =
  adminStatisticsFilterSchema.extend({
    status: z.enum(['SUBMITTED', 'CONFIRMED']).optional(),
    page: z.coerce.number().int().positive(),
    pageSize: z.coerce.number().int().positive(),
  });

export type AdminEstimateRequestListQuery = z.infer<
  typeof adminEstimateRequestListQuerySchema
>;
