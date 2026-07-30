import { z } from 'zod';

export const adminStatisticsFilterSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export type AdminStatisticsFilter = z.infer<typeof adminStatisticsFilterSchema>;
