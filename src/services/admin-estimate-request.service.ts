import { AdminEstimateRequestListDto } from '../dtos/admin-estimate-request.dto';
import {
  findEstimateRequestList,
  getEstimateRequestCount,
} from '../repositories/admin-estimate-request.repository';
import { AdminEstimateRequestListQuery } from '../schemas/admin-estimate-request.schema';
import type { AdminStatisticsFilter } from '../schemas/admin-statistics.schema';
import { createDateRange } from '../utils/admin-date-range.util';
import { EstimateRequestStatus, Prisma } from '@prisma/client';
import { AppError } from '../utils/app.error';

export const getEstimateRequestStatistics = async ({
  startDate,
  endDate,
}: AdminStatisticsFilter) => {
  const dateRange = createDateRange(startDate, endDate);

  const where: Prisma.EstimateRequestWhereInput = {
    ...(dateRange && { submittedAt: dateRange }),
  };

  const [
    totalActiveEstimateRequestCount,
    submittedEstimateRequestCount,
    confirmedEstimateRequestCount,
  ] = await Promise.all([
    getEstimateRequestCount({
      ...where,
      status: {
        in: [EstimateRequestStatus.SUBMITTED, EstimateRequestStatus.CONFIRMED],
      },
    }),
    getEstimateRequestCount({
      ...where,
      status: { in: [EstimateRequestStatus.SUBMITTED] },
    }),
    getEstimateRequestCount({
      ...where,
      status: { in: [EstimateRequestStatus.CONFIRMED] },
    }),
  ]);

  return {
    totalActiveEstimateRequestCount,
    submittedEstimateRequestCount,
    confirmedEstimateRequestCount,
  };
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
      in: [EstimateRequestStatus.SUBMITTED, EstimateRequestStatus.CONFIRMED],
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
