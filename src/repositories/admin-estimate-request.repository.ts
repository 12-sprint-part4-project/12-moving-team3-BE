import { prisma } from '../lib/prisma';
import { EstimateRequestStatus, Prisma } from '@prisma/client';
import { DashboardChartDateRange } from '../utils/admin-date-range.util';

interface RequestTrendRow {
  bucket: Date;
  count: bigint;
}

interface EstimateRequestStatusStatisticsRow {
  submitted: number;
  confirmed: number;
  completed: number;
  expired: number;
  canceled: number;
}

export const getEstimateRequestCount = async (
  where: Prisma.EstimateRequestWhereInput
) => {
  return prisma.estimateRequest.count({ where });
};

export const getEstimateRequestStatusStatistics = async (
  start?: Date,
  end?: Date
) => {
  const whereClause =
    start == null
      ? Prisma.empty
      : Prisma.sql`
        WHERE submitted_at >= ${start}
          AND submitted_at < ${end}
      `;
  const [result] = await prisma.$queryRaw<EstimateRequestStatusStatisticsRow[]>`
    SELECT
      COUNT(*) FILTER (WHERE status = 'SUBMITTED')::int AS submitted,
      COUNT(*) FILTER (WHERE status = 'CONFIRMED')::int AS confirmed,
      COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
      COUNT(*) FILTER (WHERE status = 'EXPIRED')::int AS expired,
      COUNT(*) FILTER (WHERE status = 'CANCELED')::int AS canceled
    FROM estimate_requests
    ${whereClause}
  `;
  return result;
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
    WHERE submitted_at >= ${start}
      AND submitted_at < ${end}
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

export const findEstimateRequestDetailById = async <
  T extends Prisma.EstimateRequestSelect,
>(
  id: number,
  select: T,
  status?: EstimateRequestStatus
): Promise<Prisma.EstimateRequestGetPayload<{
  select: T;
}> | null> => {
  return prisma.estimateRequest.findUnique({
    where: { id, ...(status !== undefined && { status }) },
    select,
  });
};
