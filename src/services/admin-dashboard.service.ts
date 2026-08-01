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
import {
  getUserCount,
  getUserRecentActivities,
} from '../repositories/admin-user.repository';
import {
  getCompletedEstimateRequestRecentActivities,
  getEstimateRequestCount,
  getRequestTrendRows,
} from '../repositories/admin-estimate-request.repository';
import { getQuoteCount } from '../repositories/admin-quote.repository';
import {
  getTotalReportCount,
  getUserReportRecentActivities,
} from '../repositories/admin-report.repository';
import { AdminDashboardRequestTrendFilter } from '../schemas/admin-dashboard.schema';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const KST_OFFSET_MS = 9 * HOUR_MS;

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
    buckets.push(new Date(start.getTime() + i * HOUR_MS));
  }
  return buckets;
};

const createDailyBuckets = (start: Date, days: number): Date[] => {
  const buckets: Date[] = [];

  for (let i = 0; i < days; i++) {
    buckets.push(new Date(start.getTime() + i * DAY_MS));
  }

  return buckets;
};

const toKstDate = (date: Date) => new Date(date.getTime() + KST_OFFSET_MS);

const formatTrendLabel = (
  bucket: Date,
  period: AdminDashboardRequestTrendFilter['period']
) => {
  const kstBucket = toKstDate(bucket);
  switch (period) {
    case 'DAY':
      return `${String(kstBucket.getUTCHours()).padStart(2, '0')}시`;

    case 'WEEK':
    case 'MONTH':
      return `${String(kstBucket.getUTCMonth() + 1).padStart(2, '0')}/${String(kstBucket.getUTCDate()).padStart(2, '0')}`;
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

  const [recentReports, recentUsers, recentCompletedRequests] =
    await Promise.all([
      getUserReportRecentActivities({
        createdAt: dateRange,
      }),
      getUserRecentActivities({
        createdAt: dateRange,
        deletedAt: null,
      }),
      getCompletedEstimateRequestRecentActivities({
        status: EstimateRequestStatus.COMPLETED,
        moveDate: dateRange,
      }),
    ]);

  return {
    recentReports,
    recentUsers,
    recentCompletedRequests,
  };
};
