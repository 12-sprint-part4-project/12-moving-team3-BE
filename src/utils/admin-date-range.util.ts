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

const toUtcDateFromKstDate = (date: Date): Date => {
  // Date가 의미하는 KST 날짜를 구한다.
  const kstDate = new Date(date.getTime() + KST_OFFSET_MS);

  // 그 KST 날짜의 UTC 00:00을 만든다.
  return new Date(
    Date.UTC(
      kstDate.getUTCFullYear(),
      kstDate.getUTCMonth(),
      kstDate.getUTCDate()
    )
  );
};

export const createDateRangeOnly = (startDate?: Date, endDate?: Date) => {
  if (!startDate) {
    return undefined;
  }

  const start = toUtcDateFromKstDate(startDate);
  start.setUTCHours(0, 0, 0, 0);

  const end = new Date(
    toUtcDateFromKstDate(endDate ?? startDate).getTime() + DAY_MS
  );

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

/**
 * 현재 시간을 기준으로
 * KST(한국 표준시) 오늘 자정에 해당하는 UTC Date를 반환한다.
 *
 * 예시:
 *   - now: 2024-04-04T15:10:00Z (UTC)
 *   - KST 현재 시각: 2024-04-05 00:10:00
 *   - 반환값: 2024-04-04T15:00:00Z
 *     (KST 2024-04-05 00:00:00에 해당하는 UTC 시각)
 */
const getKstStartOfToday = (now: Date): Date => {
  // 현재 시각을 KST 기준으로 변환
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);

  // KST 날짜의 자정(00:00:00)에 해당하는 UTC 타임스탬프
  const kstDateStart = Date.UTC(
    kstNow.getUTCFullYear(),
    kstNow.getUTCMonth(),
    kstNow.getUTCDate()
  );

  // KST 자정에 해당하는 UTC Date 객체 반환
  return new Date(kstDateStart - KST_OFFSET_MS);
};

export const getDashboardChartDateRange = (
  period: AdminDashboardRequestTrendFilter['period']
): DashboardChartDateRange => {
  const now = new Date();
  const today = getKstStartOfToday(now);
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
