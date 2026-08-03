import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { DashboardChartDateRange } from '../utils/admin-date-range.util';

interface RequestTrendRow {
  bucket: Date;
  count: bigint;
}

export const getEstimateRequestCount = async (
  where: Prisma.EstimateRequestWhereInput
) => {
  return prisma.estimateRequest.count({ where });
};

export const getRequestTrendRows = async ({
  start,
  end,
  groupBy,
}: DashboardChartDateRange) => {
  const trunc = Prisma.raw(`'${groupBy}'`);
  const result = await prisma.$queryRaw<RequestTrendRow[]>`
    SELECT
      DATE_TRUNC(${trunc}, submitted_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul' AS bucket,
      COUNT(*) AS count
    FROM estimate_requests
    WHERE submitted_at BETWEEN ${start} AND ${end}
    GROUP BY bucket
    ORDER BY bucket;
  `;
  return result;
};

export const getCompletedEstimateRequestRecentActivities = async (
  where: Prisma.EstimateRequestWhereInput
) => {
  return prisma.estimateRequest.findMany({
    where,
    select: {
      id: true,
      moveDate: true,
      user: { select: { name: true } },
      confirmedQuote: { select: { mover: { select: { name: true } } } },
    },
    orderBy: {
      moveDate: 'desc',
    },
    take: 5,
  });
};

export const findEstimateRequestList = async <
  T extends Prisma.EstimateRequestSelect,
>(
  where: Prisma.EstimateRequestWhereInput,
  orderBy: Prisma.EstimateRequestOrderByWithRelationInput[],
  take: number,
  skip: number,
  select: T
): Promise<
  Prisma.EstimateRequestGetPayload<{
    select: T;
  }>[]
> => {
  return prisma.estimateRequest.findMany({
    where,
    orderBy,
    take,
    skip,
    select,
  });
};
