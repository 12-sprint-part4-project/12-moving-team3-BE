import { AdminDashboardRequestTrendFilter } from '../schemas/admin-dashboard.schema';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
//최근 7일 범위(오늘 포함)
const WEEK_RANGE_MS = 6 * DAY_MS;
//최근 30일 범위(오늘 포함)
const MONTH_RANGE_MS = 29 * DAY_MS;
/**
 * YYYY-MM-DD로 전달된 날짜를
 * KST 기준 하루의 시작 시각(UTC)으로 변환한다.
 */
const toKstStartOfDay = (date: Date): Date => {
  const utcDateStart = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  );

  return new Date(utcDateStart - KST_OFFSET_MS);
};

export const createDateRange = (startDate?: Date, endDate?: Date) => {
  if (!startDate) {
    return undefined;
  }

  const start = toKstStartOfDay(startDate);
  const endExclusive = new Date(
    toKstStartOfDay(endDate ?? startDate).getTime() + DAY_MS
  );

  return {
    gte: start,
    lt: endExclusive,
  };
};

export interface DashboardChartDateRange {
  start: Date;
  end: Date;
  groupBy: 'hour' | 'day';
}

export const getDashboardChartDateRange = (
  period: AdminDashboardRequestTrendFilter['period']
): DashboardChartDateRange => {
  const now = new Date();
  const today = toKstStartOfDay(now);
  switch (period) {
    case 'DAY':
      return {
        start: today,
        end: now,
        groupBy: 'hour',
      };
    case 'WEEK':
      return {
        start: new Date(today.getTime() - WEEK_RANGE_MS),
        end: now,
        groupBy: 'day',
      };
    case 'MONTH':
      return {
        start: new Date(today.getTime() - MONTH_RANGE_MS),
        end: now,
        groupBy: 'day',
      };
  }
};
