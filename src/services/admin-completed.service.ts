import {
  findEstimateRequestDetailById,
  findEstimateRequestList,
  getEstimateRequestCount,
} from '../repositories/admin-estimate-request.repository';
import {
  averageCompletedQuotePrice,
  totalCompletedQuotePrice,
} from '../repositories/admin-quote.repository';
import { AdminCompletedListQuery } from '../schemas/admin-estimate-request.schema';
import { AdminStatisticsFilter } from '../schemas/admin-statistics.schema';
import { createDateRangeOnly } from '../utils/admin-date-range.util';
import { EstimateRequestStatus, Prisma, QuoteStatus } from '@prisma/client';
import { createEstimateRequestCommonWhere } from './admin-estimate-request.service';
import {
  AdminCompletedListDto,
  AdminCompletedRequestDetailDto,
} from '../dtos/admin-estimate-request.dto';
import { AppError } from '../utils/app.error';
import { collectMissingFields } from '../utils/admin-missing-fields.util';
import { EstimateRequestIdParams } from '../schemas/estimate-request.schema';

// 완료 처리는 cron에 의해 이사 다음 날(COMPLETED)로 변경되지만,
// 완료 통계는 실제 이사일(moveDate)을 기준으로 집계한다.
export const getCompletedStatistics = async ({
  startDate,
  endDate,
}: AdminStatisticsFilter) => {
  const dateRange = createDateRangeOnly(startDate, endDate);
  const estimateRequestWhere: Prisma.EstimateRequestWhereInput = {
    ...(dateRange && { moveDate: dateRange }),
    status: { in: [EstimateRequestStatus.COMPLETED] },
  };

  const quoteWhere: Prisma.QuoteWhereInput = {
    estimateRequest: {
      status: { in: [EstimateRequestStatus.COMPLETED] },
      ...(dateRange && {
        moveDate: dateRange,
      }),
    },
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

  const roundedAverageCompletedPrice = Math.round(averageCompletedPrice);

  return {
    totalCompletedCount,
    averageCompletedPrice: roundedAverageCompletedPrice,
    totalCompletedPrice,
  };
};

export const getCompletedList = async (
  query: AdminCompletedListQuery
): Promise<AdminCompletedListDto> => {
  const { page, pageSize, moveType, search, sort, startDate, endDate } = query;
  const dateRange = createDateRangeOnly(startDate, endDate);

  const where: Prisma.EstimateRequestWhereInput = {
    ...createEstimateRequestCommonWhere({
      search,
    }),
    ...(moveType && { moveType }),
    ...(dateRange && { moveDate: dateRange }),
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
      sort === 'ASC'
        ? [{ moveDate: 'asc' }, { id: 'desc' }]
        : [{ moveDate: 'desc' }, { id: 'desc' }],
      pageSize,
      skip,
      select
    ),
    getEstimateRequestCount(where),
  ]);

  // 필수값 누락 시 500 대신 null + missingFields로 내려 관리자가 원인을 확인할 수 있게 한다.
  const data = estimateRequests.map((item) => {
    const moveType = item.moveType;
    const departureAddress = item.departureAddress;
    const arrivalAddress = item.arrivalAddress;
    const moveDate = item.moveDate;
    const mover = item.confirmedQuote?.mover?.name ?? null;
    const price = item.confirmedQuote?.price ?? null;

    return {
      id: item.id,
      userName: item.user.name,
      phoneNumber: item.user.phoneNumber,
      moveType,
      departureAddress,
      arrivalAddress,
      moveDate,
      mover,
      price,
      missingFields: collectMissingFields({
        moveType,
        departureAddress,
        arrivalAddress,
        moveDate,
        mover,
        price,
      }),
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

export const getCompletedRequestDetail = async (
  params: EstimateRequestIdParams
): Promise<AdminCompletedRequestDetailDto> => {
  const { estimateRequestId } = params;

  const select = {
    id: true,
    user: { select: { name: true, nickname: true } },
    moveType: true,
    departureZipCode: true,
    departureAddress: true,
    departureDetailAddress: true,
    arrivalZipCode: true,
    arrivalAddress: true,
    arrivalDetailAddress: true,
    moveDate: true,
    confirmedQuote: {
      select: {
        mover: { select: { name: true, nickname: true } },
        price: true,
        comment: true,
        createdAt: true,
      },
    },
  } satisfies Prisma.EstimateRequestSelect;

  const estimateRequest = await findEstimateRequestDetailById(
    estimateRequestId,
    select,
    EstimateRequestStatus.COMPLETED
  );
  if (estimateRequest == null) {
    throw new AppError('ADMIN_ESTIMATE_REQUEST_NOT_FOUND');
  }

  const moveType = estimateRequest.moveType;
  const departureAddress = estimateRequest.departureAddress;
  const departureDetailAddress = estimateRequest.departureDetailAddress;
  const departureZipCode = estimateRequest.departureZipCode;
  const arrivalAddress = estimateRequest.arrivalAddress;
  const arrivalDetailAddress = estimateRequest.arrivalDetailAddress;
  const arrivalZipCode = estimateRequest.arrivalZipCode;
  const moveDate = estimateRequest.moveDate;

  const confirmedQuote =
    estimateRequest.confirmedQuote == null
      ? null
      : {
          moverName: estimateRequest.confirmedQuote.mover?.name ?? null,
          moverNickname: estimateRequest.confirmedQuote.mover?.nickname ?? null,
          price: estimateRequest.confirmedQuote.price ?? null,
          comment: estimateRequest.confirmedQuote.comment ?? null,
          createdAt: estimateRequest.confirmedQuote.createdAt,
        };

  return {
    data: {
      id: estimateRequest.id,
      userName: estimateRequest.user.name,
      userNickname: estimateRequest.user.nickname,
      moveType,
      departureZipCode,
      departureDetailAddress,
      arrivalZipCode,
      arrivalDetailAddress,
      departureAddress,
      arrivalAddress,
      moveDate,
      confirmedQuote,
      missingFields: collectMissingFields({
        moveType,
        departureAddress,
        departureDetailAddress,
        departureZipCode,
        arrivalAddress,
        arrivalDetailAddress,
        arrivalZipCode,
        moveDate,
        confirmedQuote,
        ...(confirmedQuote && {
          'confirmedQuote.moverName': confirmedQuote.moverName,
          'confirmedQuote.moverNickname': confirmedQuote.moverNickname,
          'confirmedQuote.price': confirmedQuote.price,
          'confirmedQuote.createdAt': confirmedQuote.createdAt,
        }),
      }),
    },
  };
};
