import type { AdminStatisticsFilter } from '../schemas/admin-statistics.schema';
import {
  EstimateRequestStatus,
  QuoteStatus,
  UserReportStatus,
} from '@prisma/client';
import {
  createDateRange,
  getDashboardChartDateRange,
} from '../utils/admin-date-range.util';
import { getUserCount } from '../repositories/admin-user.repository';
import {
  getEstimateRequestCount,
  getRequestTrendRows,
} from '../repositories/admin-estimate-request.repository';
import { getQuoteCount } from '../repositories/admin-quote.repository';
import { getTotalReportCount } from '../repositories/admin-report.repository';
import { AdminDashboardRequestTrendFilter } from '../schemas/admin-dashboard.schema';

export const getStatistics = async ({
  startDate,
  endDate,
}: AdminStatisticsFilter) => {
  const dateRange = createDateRange(startDate, endDate);

  const [
    userCount,
    estimateRequestCount,
    quoteCount,
    completedEstimateRequestCount,
    pendingReportCount,
  ] = await Promise.all([
    getUserCount({
      deletedAt: null,
      ...(dateRange && { createdAt: dateRange }),
    }),
    getEstimateRequestCount({
      status: { not: EstimateRequestStatus.DRAFT },
      ...(dateRange && { submittedAt: dateRange }),
    }),
    getQuoteCount({
      status: { not: QuoteStatus.REJECTED },
      deletedAt: null,
      ...(dateRange && { createdAt: dateRange }),
    }),
    getEstimateRequestCount({
      status: EstimateRequestStatus.COMPLETED,
      ...(dateRange && { moveDate: dateRange }),
    }),
    getTotalReportCount({
      status: UserReportStatus.PENDING,
      ...(dateRange && { createdAt: dateRange }),
    }),
  ]);

  return {
    userCount,
    estimateRequestCount,
    quoteCount,
    completedEstimateRequestCount,
    pendingReportCount,
  };
};

const createHourlyBuckets = (start: Date): Date[] => {
  const buckets: Date[] = [];
  for (let i = 0; i < 24; i++) {
    const bucket = new Date(start);
    bucket.setHours(i, 0, 0, 0);
    buckets.push(bucket);
  }
  return buckets;
};

const createDailyBuckets = (start: Date, days: number): Date[] => {
  const buckets: Date[] = [];

  for (let i = 0; i < days; i++) {
    const bucket = new Date(start);
    bucket.setDate(start.getDate() + i);
    // 날짜 비교 시 시간 차이로 인해 매칭되지 않도록 자정으로 통일한다.
    bucket.setHours(0, 0, 0, 0);
    buckets.push(bucket);
  }

  return buckets;
};

const formatTrendLabel = (
  bucket: Date,
  period: AdminDashboardRequestTrendFilter['period']
) => {
  switch (period) {
    case 'DAY':
      return `${String(bucket.getHours()).padStart(2, '0')}시`;

    case 'WEEK':
    case 'MONTH':
      return `${String(bucket.getMonth() + 1).padStart(2, '0')}/${String(bucket.getDate()).padStart(2, '0')}`;
  }
};

export const getRequestTrend = async (
  period: AdminDashboardRequestTrendFilter['period']
) => {
  const { start, end, groupBy } = getDashboardChartDateRange(period);

  const rows = await getRequestTrendRows({ start, end, groupBy });

  let buckets: Date[] = [];

  switch (period) {
    case 'DAY':
      buckets = createHourlyBuckets(start);
      break;
    case 'WEEK':
      buckets = createDailyBuckets(start, 7);
      break;
    case 'MONTH':
      buckets = createDailyBuckets(start, 30);
      break;
  }

  const trendMap = new Map(
    rows.map((row) => [row.bucket.getTime(), Number(row.count)])
  );

  const result = buckets.map((bucket) => ({
    // 기간에 맞는 라벨 형식으로 변환한다.
    label: formatTrendLabel(bucket, period),
    count: trendMap.get(bucket.getTime()) ?? 0,
  }));

  return result;
};

export const getRequestStatus = async () => {
  const { start, end } = getDashboardChartDateRange('MONTH');
  const dateRange = { gte: start, lte: end };

  const [total, requested, matched, completed] = await Promise.all([
    getEstimateRequestCount({
      status: { not: EstimateRequestStatus.DRAFT },
      submittedAt: dateRange,
    }),
    getEstimateRequestCount({
      status: EstimateRequestStatus.SUBMITTED,
      submittedAt: dateRange,
    }),
    getEstimateRequestCount({
      status: EstimateRequestStatus.CONFIRMED,
      submittedAt: dateRange,
    }),
    getEstimateRequestCount({
      status: EstimateRequestStatus.COMPLETED,
      submittedAt: dateRange,
    }),
  ]);

  return {
    total,
    requested,
    matched,
    completed,
  };
};

export const getRecentActivities = async () => {
  const { start, end } = getDashboardChartDateRange('WEEK');
  const dateRange = { gte: start, lte: end };
};
