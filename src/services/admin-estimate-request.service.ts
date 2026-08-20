import {
  AdminEstimateRequestDetailDto,
  AdminEstimateRequestListDto,
} from '../dtos/admin-estimate-request.dto';
import {
  findEstimateRequestList,
  findEstimateRequestDetailById,
  getEstimateRequestCount,
  getEstimateRequestStatusStatistics,
} from '../repositories/admin-estimate-request.repository';
import { AdminEstimateRequestListQuery } from '../schemas/admin-estimate-request.schema';
import type { AdminStatisticsFilter } from '../schemas/admin-statistics.schema';
import { createDateRange } from '../utils/admin-date-range.util';
import { EstimateRequestStatus, Prisma, QuoteStatus } from '@prisma/client';
import { AppError } from '../utils/app.error';
import { collectMissingFields } from '../utils/admin-missing-fields.util';
import { EstimateRequestIdParams } from '../schemas/estimate-request.schema';

interface QuoteMover {
  name: string;
  nickname: string;
}

interface QuoteResponseSource {
  id: number;
  mover: QuoteMover | null;
  price: number | null;
  status: QuoteStatus;
  createdAt: Date;
}

export const getEstimateRequestStatistics = async ({
  startDate,
  endDate,
}: AdminStatisticsFilter) => {
  const dateRange = createDateRange(startDate, endDate);
  const { submitted, confirmed, expired, canceled } =
    await getEstimateRequestStatusStatistics(dateRange?.gte, dateRange?.lt);

  return { submitted, confirmed, expired, canceled };
};

export const createEstimateRequestCommonWhere = ({
  search,
}: {
  search?: string;
}): Prisma.EstimateRequestWhereInput => {
  const orConditions: Prisma.EstimateRequestWhereInput[] = [];
  const normalizedPhoneNumber = search?.replace(/\D/g, '');

  if (search) {
    const id = Number(search);

    if (Number.isInteger(id) && id >= -2147483648 && id <= 2147483647) {
      orConditions.push({ id });
    }

    orConditions.push({
      user: {
        name: {
          contains: search,
        },
      },
    });

    if (normalizedPhoneNumber) {
      orConditions.push({
        user: {
          phoneNumber: {
            contains: normalizedPhoneNumber,
          },
        },
      });
    }
  }

  return {
    ...(orConditions.length > 0 && { OR: orConditions }),
  };
};

export const getEstimateRequestList = async (
  query: AdminEstimateRequestListQuery
): Promise<AdminEstimateRequestListDto> => {
  const { page, pageSize, status, search, sort, startDate, endDate } = query;
  const dateRange = createDateRange(startDate, endDate);

  const where: Prisma.EstimateRequestWhereInput = {
    ...createEstimateRequestCommonWhere({
      search,
    }),
    status: status ?? {
      not: {
        in: [EstimateRequestStatus.DRAFT, EstimateRequestStatus.COMPLETED],
      },
    },
    ...(dateRange && { submittedAt: dateRange }),
  };

  const select = {
    id: true,
    user: { select: { name: true, phoneNumber: true } },
    moveType: true,
    departureAddress: true,
    arrivalAddress: true,
    submittedAt: true,
    status: true,
    _count: { select: { quotes: { where: { deletedAt: null } } } },
    confirmedQuote: { select: { mover: { select: { name: true } } } },
  } satisfies Prisma.EstimateRequestSelect;

  const skip = (page - 1) * pageSize;
  const [estimateRequests, totalCount] = await Promise.all([
    findEstimateRequestList(
      where,
      sort === 'ASC'
        ? [{ submittedAt: 'asc' }, { id: 'desc' }]
        : [{ submittedAt: 'desc' }, { id: 'desc' }],
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
    const submittedAt = item.submittedAt;

    return {
      id: item.id,
      userName: item.user.name,
      phoneNumber: item.user.phoneNumber,
      moveType,
      departureAddress,
      arrivalAddress,
      submittedAt,
      status: item.status,
      estimateCount: item._count.quotes,
      mover: item.confirmedQuote?.mover?.name ?? null,
      missingFields: collectMissingFields({
        moveType,
        departureAddress,
        arrivalAddress,
        submittedAt,
      }),
    };
  });

  return {
    data,
    meta: {
      page,
      pageSize,
      totalCount,
      totalPages: Math.ceil(totalCount / pageSize),
    },
  };
};

export const getEstimateRequestDetail = async (
  params: EstimateRequestIdParams
): Promise<AdminEstimateRequestDetailDto> => {
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
    submittedAt: true,
    status: true,
    quotes: {
      select: {
        id: true,
        mover: { select: { name: true, nickname: true } },
        price: true,
        status: true,
        createdAt: true,
        deletedAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    },
  } satisfies Prisma.EstimateRequestSelect;

  const estimateRequest = await findEstimateRequestDetailById(
    estimateRequestId,
    select
  );

  if (estimateRequest == null) {
    throw new AppError('ADMIN_ESTIMATE_REQUEST_NOT_FOUND');
  }

  if (
    estimateRequest.status === EstimateRequestStatus.DRAFT ||
    estimateRequest.status === EstimateRequestStatus.COMPLETED
  ) {
    throw new AppError('ADMIN_ESTIMATE_REQUEST_NOT_FOUND');
  }

  const moveType = estimateRequest.moveType;
  const departureAddress = estimateRequest.departureAddress;
  const departureDetailAddress = estimateRequest.departureDetailAddress;
  const departureZipCode = estimateRequest.departureZipCode;
  const arrivalAddress = estimateRequest.arrivalAddress;
  const arrivalZipCode = estimateRequest.arrivalZipCode;
  const arrivalDetailAddress = estimateRequest.arrivalDetailAddress;
  const submittedAt = estimateRequest.submittedAt;

  const toQuoteResponse = (quote: QuoteResponseSource) => ({
    id: quote.id,
    moverName: quote.mover?.name ?? null,
    moverNickname: quote.mover?.nickname ?? null,
    price: quote.price ?? null,
    status: quote.status,
    createdAt: quote.createdAt,
  });

  const activeQuotes = estimateRequest.quotes
    .filter((q) => q.deletedAt == null)
    .map(toQuoteResponse);

  const deletedQuotes = estimateRequest.quotes
    .filter((q) => q.deletedAt != null)
    .map(toQuoteResponse);

  return {
    data: {
      id: estimateRequest.id,
      userName: estimateRequest.user.name,
      userNickname: estimateRequest.user.nickname,
      moveType,
      departureAddress,
      departureDetailAddress,
      departureZipCode,
      arrivalAddress,
      arrivalZipCode,
      arrivalDetailAddress,
      submittedAt,
      status: estimateRequest.status,
      deletedQuotesCount: deletedQuotes.length,
      activeQuotesCount: activeQuotes.length,
      deletedQuotes,
      activeQuotes,
      missingFields: collectMissingFields({
        moveType,
        departureAddress,
        departureDetailAddress,
        departureZipCode,
        arrivalAddress,
        arrivalZipCode,
        arrivalDetailAddress,
        submittedAt,
      }),
    },
  };
};
