import { Prisma, type UserType } from '@prisma/client';
import type {
  AdminReviewListItemDto,
  AdminReviewListResultDto,
  AdminReviewUserSummaryDto,
} from '../dtos/admin-review.dto';
import {
  findAdminReviewsWithCount,
  getAverageReviewScore,
  getReviewCount,
  type AdminReviewListRow,
} from '../repositories/admin-review.repository';
import type { AdminReviewListQuery } from '../schemas/admin-review.schema';
import type { AdminStatisticsFilter } from '../schemas/admin-statistics.schema';
import { createDateRange } from '../utils/admin-date-range.util';

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

/** User select row → 작성자·기사 요약 DTO */
const toAdminReviewUserSummary = (user: {
  id: string;
  name: string;
  nickname: string;
  email: string;
  userType: UserType;
}): AdminReviewUserSummaryDto => ({
  id: user.id,
  name: user.name,
  nickname: user.nickname,
  email: user.email,
  userType: user.userType,
});

/** Repository row → 목록 아이템 DTO */
const toAdminReviewListItem = (
  row: AdminReviewListRow
): AdminReviewListItemDto => ({
  id: row.id,
  userId: row.userId,
  quoteId: row.quoteId,
  rating: row.rating,
  content: row.content,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  author: toAdminReviewUserSummary(row.user),
  // Quote.moverId가 null이면 Prisma가 mover를 null로 준다.
  mover: row.quote.mover ? toAdminReviewUserSummary(row.quote.mover) : null,
});

/** 관리자 리뷰 목록 조회 */
export const getAdminReviewList = async (
  params: AdminReviewListQuery
): Promise<AdminReviewListResultDto> => {
  const { items, totalCount } = await findAdminReviewsWithCount(params);

  return {
    items: items.map(toAdminReviewListItem),
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      totalCount,
      totalPages: Math.ceil(totalCount / params.pageSize),
    },
  };
};
