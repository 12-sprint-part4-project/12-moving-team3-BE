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

/** targetId 문자열을 Int PK용 숫자로 변환. 유효하지 않으면 null */
export const parseNumericTargetId = (targetId: string): number | null => {
  if (!/^[1-9]\d*$/.test(targetId)) {
    return null;
  }

  const id = Number(targetId);

  // Prisma Int 범위를 벗어나면 조회하지 않고 null로 둔다.
  if (!Number.isSafeInteger(id) || id < 1 || id > 2_147_483_647) {
    return null;
  }

  return id;
};

const targetAuthorSelect = {
  id: true,
  name: true,
  nickname: true,
} satisfies Prisma.UserSelect;

/** USER 대상 배치 조회 — soft-delete된 유저는 목록에서 null 처리하기 위해 제외한다 */
export const findReportTargetUsersByIds = async (ids: string[]) => {
  if (ids.length === 0) {
    return [];
  }

  return prisma.user.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: {
      id: true,
      name: true,
      nickname: true,
      email: true,
      userType: true,
    },
  });
};

/** REVIEW 대상 배치 조회 */
export const findReportTargetReviewsByIds = async (ids: number[]) => {
  if (ids.length === 0) {
    return [];
  }

  return prisma.review.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: {
      id: true,
      rating: true,
      content: true,
      user: { select: targetAuthorSelect },
    },
  });
};

/** CHAT_ROOM 대상 배치 조회 */
export const findReportTargetChatRoomsByIds = async (ids: number[]) => {
  if (ids.length === 0) {
    return [];
  }

  return prisma.chatRoom.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      roomType: true,
      createdAt: true,
    },
  });
};

/** MESSAGE 대상 배치 조회 */
export const findReportTargetMessagesByIds = async (ids: number[]) => {
  if (ids.length === 0) {
    return [];
  }

  return prisma.chatMessage.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      content: true,
      messageType: true,
      sender: { select: targetAuthorSelect },
    },
  });
};

/** ARTICLE(Post) 대상 배치 조회 */
export const findReportTargetArticlesByIds = async (ids: number[]) => {
  if (ids.length === 0) {
    return [];
  }

  return prisma.post.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: {
      id: true,
      title: true,
      category: true,
      user: { select: targetAuthorSelect },
    },
  });
};

/** COMMENT 대상 배치 조회 */
export const findReportTargetCommentsByIds = async (ids: number[]) => {
  if (ids.length === 0) {
    return [];
  }

  return prisma.comment.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: {
      id: true,
      content: true,
      user: { select: targetAuthorSelect },
    },
  });
};
