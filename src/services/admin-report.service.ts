import { Prisma, UserReportStatus } from '@prisma/client';
import {
  findAdminReports,
  getTotalReportCount,
  type AdminReportListRow,
} from '../repositories/admin-report.repository';
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

/** 관리자 신고 목록 조회 — 기본 필드만 반환한다 */
export const getAdminReportList = async (): Promise<AdminReportListRow[]> => {
  return findAdminReports();
};
