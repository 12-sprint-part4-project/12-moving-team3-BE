import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import type { AdminReportListQuery } from '../schemas/admin-report.schema';

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

/** 신고 목록 select — reporter FK를 include해 N+1 없이 신고자 요약을 붙인다 */
const adminReportListSelect = {
  id: true,
  reporterId: true,
  target: true,
  targetId: true,
  category: true,
  status: true,
  createdAt: true,
  // 댓글 목록의 userId+user 패턴처럼 FK id와 요약 객체를 함께 내려준다.
  reporter: {
    select: {
      id: true,
      name: true,
      nickname: true,
      email: true,
      userType: true,
    },
  },
} satisfies Prisma.UserReportSelect;

export type AdminReportListRow = Prisma.UserReportGetPayload<{
  select: typeof adminReportListSelect;
}>;

/** status·target이 있으면 AND로 좁히고, 없으면 전체 목록을 조회한다 */
const buildAdminReportListWhere = (
  params: Pick<AdminReportListQuery, 'status' | 'target'>
): Prisma.UserReportWhereInput => {
  const where: Prisma.UserReportWhereInput = {};

  if (params.status) {
    where.status = params.status;
  }

  if (params.target) {
    where.target = params.target;
  }

  return where;
};

/** 관리자 신고 목록 + 전체 건수 조회 (totalPages는 Service에서 계산) */
export const findAdminReportsWithCount = async (
  params: AdminReportListQuery
): Promise<{ items: AdminReportListRow[]; totalCount: number }> => {
  const where = buildAdminReportListWhere(params);
  const skip = (params.page - 1) * params.pageSize;

  const [items, totalCount] = await prisma.$transaction([
    prisma.userReport.findMany({
      where,
      select: adminReportListSelect,
      // createdAt이 같으면 id로 tie-break해 offset 페이지네이션 순서를 안정화한다.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take: params.pageSize,
    }),
    prisma.userReport.count({ where }),
  ]);

  return { items, totalCount };
};
