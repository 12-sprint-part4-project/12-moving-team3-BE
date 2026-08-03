import { getEstimateRequestCount } from '../repositories/admin-estimate-request.repository';
import {
  averageCompletedQuotePrice,
  totalCompletedQuotePrice,
} from '../repositories/admin-quote.repository';
import { AdminCompletedListQuery } from '../schemas/admin-estimate-request.schema';
import { AdminStatisticsFilter } from '../schemas/admin-statistics.schema';
import { createDateRange } from '../utils/admin-date-range.util';
import { EstimateRequestStatus, Prisma, QuoteStatus } from '@prisma/client';
import { createEstimateRequestCommonWhere } from './admin-estimate-request.service';

// 완료 처리는 cron에 의해 이사 다음 날(COMPLETED)로 변경되지만,
// 완료 통계는 실제 이사일(moveDate)을 기준으로 집계한다.
export const getCompletedStatistics = async ({
  startDate,
  endDate,
}: AdminStatisticsFilter) => {
  const dateRange = createDateRange(startDate, endDate);
  const estimateRequestWhere: Prisma.EstimateRequestWhereInput = {
    ...(dateRange && { moveDate: dateRange }),
    status: { in: [EstimateRequestStatus.COMPLETED] },
  };

  const quoteWhere: Prisma.QuoteWhereInput = {
    ...(dateRange && { estimateRequest: { moveDate: dateRange } }),
    status: { in: [QuoteStatus.CONFIRMED] },
  };

  const [totalCompletedCount, averageCompletedPrice, totalCompletedPrice] =
    await Promise.all([
      getEstimateRequestCount({
        ...estimateRequestWhere,
        status: { in: [EstimateRequestStatus.COMPLETED] },
      }),
      averageCompletedQuotePrice(quoteWhere),
      totalCompletedQuotePrice(quoteWhere),
    ]);

  return {
    totalCompletedCount,
    averageCompletedPrice,
    totalCompletedPrice,
  };
};

export const getCompletedList = async (
  query: AdminCompletedListQuery
): Promise<AdminCompletedListDto> => {
  const { page, pageSize, moveType, search, startDate, endDate } = query;
  const where: Prisma.EstimateRequestWhereInput = {
    ...createEstimateRequestCommonWhere({
      search,
      startDate,
      endDate,
    }),
    ...(moveType && { moveType }),
  };
};
