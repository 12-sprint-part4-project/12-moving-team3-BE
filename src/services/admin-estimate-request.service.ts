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
import { EstimateRequestStatus, Prisma } from '@prisma/client';
import { AppError } from '../utils/app.error';
import { EstimateRequestIdParams } from '../schemas/estimate-request.schema';

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
  startDate,
  endDate,
}: {
  search?: string;
  startDate?: Date;
  endDate?: Date;
}): Prisma.EstimateRequestWhereInput => {
  const dateRange = createDateRange(startDate, endDate);
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
    ...(dateRange && { submittedAt: dateRange }),
    ...(orConditions.length > 0 && { OR: orConditions }),
  };
};

export const getEstimateRequestList = async (
  query: AdminEstimateRequestListQuery
): Promise<AdminEstimateRequestListDto> => {
  const { page, pageSize, status, search, startDate, endDate } = query;

  const where: Prisma.EstimateRequestWhereInput = {
    ...createEstimateRequestCommonWhere({
      search,
      startDate,
      endDate,
    }),
    status: status ?? {
      not: {
        in: [EstimateRequestStatus.DRAFT, EstimateRequestStatus.COMPLETED],
      },
    },
  };

  const select = {
    id: true,
    user: { select: { name: true, phoneNumber: true } },
    moveType: true,
    departureAddress: true,
    arrivalAddress: true,
    submittedAt: true,
    status: true,
    _count: { select: { quotes: true } },
    confirmedQuote: { select: { mover: { select: { name: true } } } },
  } satisfies Prisma.EstimateRequestSelect;

  const skip = (page - 1) * pageSize;
  const [estimateRequests, totalCount] = await Promise.all([
    findEstimateRequestList(
      where,
      [{ submittedAt: 'desc' }, { id: 'desc' }],
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
      item.submittedAt == null
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
      submittedAt: item.submittedAt,
      status: item.status,
      estimateCount: item._count.quotes,
      mover: item.confirmedQuote?.mover?.name ?? null,
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
    user: { select: { name: true } },
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
        mover: { select: { name: true } },
        price: true,
        status: true,
        createdAt: true,
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

  if (
    estimateRequest.moveType == null ||
    estimateRequest.departureAddress == null ||
    estimateRequest.departureDetailAddress == null ||
    estimateRequest.departureZipCode == null ||
    estimateRequest.arrivalAddress == null ||
    estimateRequest.arrivalZipCode == null ||
    estimateRequest.arrivalDetailAddress == null ||
    estimateRequest.submittedAt == null
  ) {
    throw new AppError('INTERNAL_SERVER_ERROR');
  }

  const quotes = estimateRequest.quotes.map((quote) => {
    if (quote.mover == null) {
      throw new AppError('INTERNAL_SERVER_ERROR');
    }

    return {
      id: quote.id,
      moverName: quote.mover.name,
      price: quote.price ?? null,
      status: quote.status,
      createdAt: quote.createdAt,
    };
  });

  return {
    data: {
      id: estimateRequest.id,
      userName: estimateRequest.user.name,
      moveType: estimateRequest.moveType,
      departureAddress: estimateRequest.departureAddress,
      departureDetailAddress: estimateRequest.departureDetailAddress,
      departureZipCode: estimateRequest.departureZipCode,
      arrivalAddress: estimateRequest.arrivalAddress,
      arrivalZipCode: estimateRequest.arrivalZipCode,
      arrivalDetailAddress: estimateRequest.arrivalDetailAddress,
      submittedAt: estimateRequest.submittedAt,
      status: estimateRequest.status,
      estimateCount: quotes.length,
      quotes,
    },
  };
};
