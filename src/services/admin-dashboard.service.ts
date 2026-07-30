import { adminDashboardStatisticsQuerySchema } from '../schemas/admin-dashboard.schema';
import { z } from 'zod';
import { createDateRange } from '../utils/admin-date-range.util';
import {
  getCompletedEstimateRequestCount,
  getEstimateRequestCount,
  getPendingReportCount,
  getQuoteCount,
  getUserCount,
} from '../repositories/admin-dashboard.repository';

export type AdminDashboardStatisticsQueryParams = z.infer<
  typeof adminDashboardStatisticsQuerySchema
>;

export const getStatistics = async ({
  startDate,
  endDate,
}: AdminDashboardStatisticsQueryParams) => {
  const where = createDateRange(startDate, endDate);

  const [
    userCount,
    estimateRequestCount,
    quoteCount,
    completedEstimateRequestCount,
    pendingReportCount,
  ] = await Promise.all([
    getUserCount(where),
    getEstimateRequestCount(where),
    getQuoteCount(where),
    getCompletedEstimateRequestCount(where),
    getPendingReportCount(where),
  ]);

  return {
    userCount,
    estimateRequestCount,
    quoteCount,
    completedEstimateRequestCount,
    pendingReportCount,
  };
};
