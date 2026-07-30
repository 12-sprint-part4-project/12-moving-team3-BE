import type { AdminDashboardStatisticsQuery } from '../schemas/admin-dashboard.schema';
import {
  EstimateRequestStatus,
  QuoteStatus,
  UserReportStatus,
} from '@prisma/client';
import { createDateRange } from '../utils/admin-date-range.util';
import {
  getEstimateRequestCount,
  getPendingReportCount,
  getQuoteCount,
  getUserCount,
} from '../repositories/admin-dashboard.repository';

export const getStatistics = async ({
  startDate,
  endDate,
}: AdminDashboardStatisticsQuery) => {
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
    getPendingReportCount({
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
