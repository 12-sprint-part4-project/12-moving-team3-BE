import { z } from 'zod';

export const adminDashboardRequestTrendFilterSchema = z.object({
  period: z.enum(['DAY', 'WEEK', 'MONTH']),
});

export type AdminDashboardRequestTrendFilter = z.infer<
  typeof adminDashboardRequestTrendFilterSchema
>;
