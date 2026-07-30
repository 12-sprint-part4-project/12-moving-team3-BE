import { z } from 'zod';

// YYYY-MM-DD 형식의 날짜 문자열을 UTC 기준 자정(Date)으로 변환한다.
const statisticsDateSchema = z.iso
  .date()
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

export const adminStatisticsFilterSchema = z.object({
  startDate: statisticsDateSchema.optional(),
  endDate: statisticsDateSchema.optional(),
});

export type AdminStatisticsFilter = z.infer<typeof adminStatisticsFilterSchema>;
