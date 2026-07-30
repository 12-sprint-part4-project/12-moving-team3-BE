import type { AdminDashboardStatisticsQuery } from '../schemas/admin-dashboard.schema';
import {
  EstimateRequestStatus,
  QuoteStatus,
  UserReportStatus,
} from '@prisma/client';
import { createDateRange } from '../utils/admin-date-range.util';
import { getUserCount } from '../repositories/admin-user.repository';
import { getEstimateRequestCount } from '../repositories/admin-estimate-request.repository';
import { getQuoteCount } from '../repositories/admin-quote.repository';
import { getPendingReportCount } from '../repositories/admin-report.repository';

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
