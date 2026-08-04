import { Prisma, UserReportStatus } from '@prisma/client';
import type { AdminReportListResultDto } from '../dtos/admin-report.dto';
import {
  findAdminReportsWithCount,
  getTotalReportCount,
} from '../repositories/admin-report.repository';
import type { AdminReportListQuery } from '../schemas/admin-report.schema';
import type { AdminStatisticsFilter } from '../schemas/admin-statistics.schema';
import { createDateRange } from '../utils/admin-date-range.util';

export const getReportStatistics = async ({
  startDate,
  endDate,
}: AdminStatisticsFilter) => {
  const dateRange = createDateRange(startDate, endDate);
  const where: Prisma.UserReportWhereInput = {
    ...(dateRange && { createdAt: dateRange }),
  };

  const [
    totalReportCount,
    pendingReportCount,
    resolvedReportCount,
    rejectedReportCount,
  ] = await Promise.all([
    getTotalReportCount(where),
    getTotalReportCount({ ...where, status: UserReportStatus.PENDING }),
    getTotalReportCount({ ...where, status: UserReportStatus.RESOLVED }),
    getTotalReportCount({ ...where, status: UserReportStatus.REJECTED }),
  ]);

  return {
    totalReportCount,
    pendingReportCount,
    resolvedReportCount,
    rejectedReportCount,
  };
};

/** 관리자 신고 목록 조회 — 필터와 페이지네이션 메타를 함께 반환한다 */
export const getAdminReportList = async (
  params: AdminReportListQuery
): Promise<AdminReportListResultDto> => {
  const { items, totalCount } = await findAdminReportsWithCount(params);

  return {
    items,
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      totalCount,
      totalPages: Math.ceil(totalCount / params.pageSize),
    },
  };
};
