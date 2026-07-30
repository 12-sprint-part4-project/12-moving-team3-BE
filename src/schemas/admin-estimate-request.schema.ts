import { z } from 'zod';

const adminEstimateRequestFilterSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  keyword: z.string().optional(),
});

export const adminEstimateRequestStatisticsQuerySchema =
  adminEstimateRequestFilterSchema;

export type AdminEstimateRequestStatisticsQuery = z.infer<
  typeof adminEstimateRequestStatisticsQuerySchema
>;

export const adminEstimateRequestListQuerySchema =
  adminEstimateRequestFilterSchema.extend({
    status: z.enum(['SUBMITTED', 'CONFIRMED']).optional(),
    page: z.coerce.number().int().positive(),
    pageSize: z.coerce.number().int().positive(),
  });

export type AdminEstimateRequestListQuery = z.infer<
  typeof adminEstimateRequestListQuerySchema
>;
