import { z } from 'zod';

// YYYY-MM-DD 형식의 날짜 문자열을 UTC 기준 자정(Date)으로 변환한다.
const statisticsDateSchema = z.iso
  .date()
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

export const adminStatisticsFilterSchema = z
  .object({
    startDate: statisticsDateSchema.optional(),
    endDate: statisticsDateSchema.optional(),
  })
  // 종료일만 전달하거나 종료일이 시작일보다 이전인 범위는 허용하지 않는다.
  .refine(({ startDate, endDate }) => !(endDate && !startDate))
  .refine(
    ({ startDate, endDate }) => !startDate || !endDate || startDate <= endDate
  );

export type AdminStatisticsFilter = z.infer<typeof adminStatisticsFilterSchema>;
