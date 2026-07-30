import { getEstimateRequestCount } from '../repositories/admin-estimate-request.repository';
import {
  averageCompletedQuotePrice,
  totalCompletedQuotePrice,
} from '../repositories/admin-quote.repository';
import { AdminStatisticsFilter } from '../schemas/admin-statistics.schema';
import { createDateRange } from '../utils/admin-date-range.util';
import { EstimateRequestStatus, Prisma, QuoteStatus } from '@prisma/client';

export const getCompletedStatistics = async ({
  startDate,
  endDate,
}: AdminStatisticsFilter) => {
  const dateRange = createDateRange(startDate, endDate);
  const EstimateRequestWhere: Prisma.EstimateRequestWhereInput = {
    ...(dateRange && { moveDate: dateRange }),
    status: { in: [EstimateRequestStatus.COMPLETED] },
  };

  const QuoteWhere: Prisma.QuoteWhereInput = {
    ...(dateRange && { createdAt: dateRange }),
    status: { in: [QuoteStatus.CONFIRMED] },
  };

  const [totalCompletedCount, averageCompletedPrice, totalCompletedPrice] =
    await Promise.all([
      getEstimateRequestCount({
        ...EstimateRequestWhere,
        status: { in: [EstimateRequestStatus.COMPLETED] },
      }),
      averageCompletedQuotePrice(QuoteWhere),
      totalCompletedQuotePrice(QuoteWhere),
    ]);

  return {
    totalCompletedCount,
    averageCompletedPrice,
    totalCompletedPrice,
  };
};
