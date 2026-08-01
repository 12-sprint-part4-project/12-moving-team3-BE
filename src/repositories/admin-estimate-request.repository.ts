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
      DATE_TRUNC(${trunc}, submitted_at) AS bucket,
      COUNT(*) AS count
    FROM estimate_requests
    WHERE submitted_at BETWEEN ${start} AND ${end}
    GROUP BY bucket
    ORDER BY bucket;
  `;
  return result;
};

export const getEstimateRequestRecentActivities = async (
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
