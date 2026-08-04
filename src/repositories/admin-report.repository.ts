import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export const getTotalReportCount = async (
  where: Prisma.UserReportWhereInput
) => {
  return prisma.userReport.count({ where });
};

export const getUserReportRecentActivities = async (
  where: Prisma.UserReportWhereInput
) => {
  return prisma.userReport.findMany({
    where,
    select: {
      createdAt: true,
      target: true,
      category: true,
      status: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 5,
  });
};

/** 신고 목록 기본 select — 필터/페이지네이션/상세 include 이전 최소 필드만 조회한다 */
const adminReportListSelect = {
  id: true,
  reporterId: true,
  target: true,
  targetId: true,
  category: true,
  status: true,
  createdAt: true,
} satisfies Prisma.UserReportSelect;

export type AdminReportListRow = Prisma.UserReportGetPayload<{
  select: typeof adminReportListSelect;
}>;

/** 관리자 신고 목록 조회 (최신순). 필터·페이지네이션은 이후 단계에서 추가한다. */
export const findAdminReports = async (): Promise<AdminReportListRow[]> => {
  return prisma.userReport.findMany({
    select: adminReportListSelect,
    // createdAt이 같으면 id로 tie-break해 목록 순서를 안정화한다.
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
};
