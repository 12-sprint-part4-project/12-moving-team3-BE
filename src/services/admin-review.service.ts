import { Prisma } from '@prisma/client';
import { createDateRange } from '../utils/admin-date-range.util';
import { AdminStatisticsFilter } from '../schemas/admin-statistics.schema';
import {
  getAverageReviewScore,
  getReviewCount,
} from '../repositories/admin-review.repository';

export const getReviewStatistics = async ({
  startDate,
  endDate,
}: AdminStatisticsFilter) => {
  const dateRange = createDateRange(startDate, endDate);
  const where: Prisma.ReviewWhereInput = {
    ...(dateRange && { createdAt: dateRange }),
  };

  const [totalReviewCount, averageReviewScore, deletedReviewCount] =
    await Promise.all([
      getReviewCount({ ...where, deletedAt: null }),
      getAverageReviewScore({ ...where, deletedAt: null }),
      getReviewCount({ ...where, deletedAt: { not: null } }),
    ]);

  return {
    totalReviewCount,
    averageReviewScore,
    deletedReviewCount,
  };
};
