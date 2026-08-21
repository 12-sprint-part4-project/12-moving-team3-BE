import { AdminDashboardRequestTrendFilter } from '../schemas/admin-dashboard.schema';
import { startOfDayKst } from './date.util';

const DAY_MS = 24 * 60 * 60 * 1000;
//최근 7일 범위(오늘 포함)
const WEEK_RANGE_MS = 6 * DAY_MS;
//최근 30일 범위(오늘 포함)
const MONTH_RANGE_MS = 29 * DAY_MS;

export const createDateRange = (startDate?: Date, endDate?: Date) => {
  if (!startDate) {
    return undefined;
  }

  const start = startOfDayKst(startDate);
  const endExclusive = new Date(
    startOfDayKst(endDate ?? startDate).getTime() + DAY_MS
  );

  return {
    gte: start,
    lt: endExclusive,
  };
};

export const createDateRangeOnly = (startDate?: Date, endDate?: Date) => {
  if (!startDate) {
    return undefined;
  }

  const start = startOfDayKst(startDate);
  const end = new Date(startOfDayKst(endDate ?? startDate).getTime() + DAY_MS);

  return {
    gte: start,
    lt: end,
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
  const today = startOfDayKst(now);
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
