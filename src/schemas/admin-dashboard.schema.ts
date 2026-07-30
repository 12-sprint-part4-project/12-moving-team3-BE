import { z } from 'zod';

export const adminDashboardStatisticsQuerySchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export type AdminDashboardStatisticsQuery = z.infer<
  typeof adminDashboardStatisticsQuerySchema
>;
