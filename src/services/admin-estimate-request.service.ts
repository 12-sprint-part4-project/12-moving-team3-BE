import { getEstimateRequestCount } from '../repositories/admin-estimate-request.repository';
import type { AdminStatisticsFilter } from '../schemas/admin-statistics.schema';
import { createDateRange } from '../utils/admin-date-range.util';
import { EstimateRequestStatus, Prisma } from '@prisma/client';
export const getEstimateRequestStatistics = async ({
  startDate,
  endDate,
  keyword,
}: AdminStatisticsFilter) => {
  const dateRange = createDateRange(startDate, endDate);

  const where: Prisma.EstimateRequestWhereInput = {
    ...(dateRange && { submittedAt: dateRange }),
    ...(keyword && {
      OR: [
        { id: Number(keyword) || undefined },
        { user: { name: { contains: keyword, mode: 'insensitive' } } },
        { user: { phoneNumber: { contains: keyword, mode: 'insensitive' } } },
      ],
    }),
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
