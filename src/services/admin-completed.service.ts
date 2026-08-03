import {
  findEstimateRequestList,
  getEstimateRequestCount,
} from '../repositories/admin-estimate-request.repository';
import {
  averageCompletedQuotePrice,
  totalCompletedQuotePrice,
} from '../repositories/admin-quote.repository';
import { AdminCompletedListQuery } from '../schemas/admin-estimate-request.schema';
import { AdminStatisticsFilter } from '../schemas/admin-statistics.schema';
import { createDateRange } from '../utils/admin-date-range.util';
import { EstimateRequestStatus, Prisma, QuoteStatus } from '@prisma/client';
import { createEstimateRequestCommonWhere } from './admin-estimate-request.service';
import { AdminCompletedListDto } from '../dtos/admin-estimate-request.dto';
import { AppError } from '../utils/app.error';

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
    status: EstimateRequestStatus.COMPLETED,
  };

  const select = {
    id: true,
    user: { select: { name: true, phoneNumber: true } },
    moveType: true,
    departureAddress: true,
    arrivalAddress: true,
    moveDate: true,
    confirmedQuote: {
      select: {
        mover: { select: { name: true } },
        price: true,
      },
    },
  } satisfies Prisma.EstimateRequestSelect;

  const skip = (page - 1) * pageSize;
  const [estimateRequests, totalCount] = await Promise.all([
    findEstimateRequestList(
      where,
      [{ moveDate: 'desc' }, { id: 'desc' }],
      pageSize,
      skip,
      select
    ),
    getEstimateRequestCount(where),
  ]);

  const data = estimateRequests.map((item) => {
    if (
      item.moveType == null ||
      item.departureAddress == null ||
      item.arrivalAddress == null ||
      item.moveDate == null ||
      item.confirmedQuote == null ||
      item.confirmedQuote.mover == null ||
      item.confirmedQuote.price == null
    ) {
      throw new AppError('INTERNAL_SERVER_ERROR');
    }
    return {
      id: item.id,
      userName: item.user.name,
      phoneNumber: item.user.phoneNumber,
      moveType: item.moveType,
      departureAddress: item.departureAddress,
      arrivalAddress: item.arrivalAddress,
      moveDate: item.moveDate,
      mover: item.confirmedQuote.mover.name,
      price: item.confirmedQuote.price,
    };
  });

  return {
    data,
    meta: {
      totalCount,
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize),
    },
  };
};
