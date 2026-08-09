import { HistoryAction, Prisma, type UserType } from '@prisma/client';
import type {
  AdminReviewListItemDto,
  AdminReviewListResultDto,
  AdminReviewUserSummaryDto,
} from '../dtos/admin-review.dto';
import {
  runAuditedTransaction,
  runWithManualAudit,
} from '../lib/audit-context';
import {
  findAdminReviewsWithCount,
  getAverageReviewScore,
  getReviewCount,
  softDeleteAdminReview,
  type AdminReviewListRow,
} from '../repositories/admin-review.repository';
import { createHistory } from '../repositories/history.repository';
import type { AdminReviewListQuery } from '../schemas/admin-review.schema';
import type { AdminStatisticsFilter } from '../schemas/admin-statistics.schema';
import { AppError } from '../utils/app.error';
import { createDateRange } from '../utils/admin-date-range.util';

/** History.tableName — Review @@map("reviews")와 동일 */
const REVIEW_TABLE_NAME = 'reviews';

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

/**
 * soft delete History 스냅샷 — 신고 콘텐츠 DELETE History와 동일하게
 * { id, deletedAt }만 남긴다. tableRowId로 대상 리뷰를 식별한다.
 * (History 모델에 reason 필드는 없다)
 */
const toReviewDeleteHistoryJson = (row: {
  id: number;
  deletedAt: string | null;
}): Prisma.InputJsonValue => ({
  id: row.id,
  deletedAt: row.deletedAt,
});

/**
 * 관리자 리뷰 soft delete + History.
 * runWithManualAudit로 Trigger histories INSERT를 skip하고,
 * 동일 runAuditedTransaction에서 soft delete와 createHistory를 원자적으로 처리한다.
 * Repository 결과 kind를 HTTP 오류로 매핑한다 — 미존재와 중복 삭제를 구분한다.
 */
export const deleteAdminReview = async (
  reviewId: number,
  adminId: number
): Promise<void> => {
  const deletedAt = new Date();

  await runWithManualAudit(() =>
    runAuditedTransaction(async (tx) => {
      const result = await softDeleteAdminReview(reviewId, deletedAt, tx);

      switch (result.kind) {
        case 'deleted': {
          // Trigger soft-delete → DELETE 규약과 동일하게 Service History를 남긴다.
          await createHistory(
            {
              userId: null,
              adminUserId: adminId,
              tableName: REVIEW_TABLE_NAME,
              tableRowId: String(result.id),
              operationType: HistoryAction.DELETE,
              beforeData: toReviewDeleteHistoryJson({
                id: result.id,
                deletedAt: null,
              }),
              afterData: toReviewDeleteHistoryJson({
                id: result.id,
                deletedAt: result.deletedAt.toISOString(),
              }),
            },
            tx
          );
          return;
        }
        case 'already_deleted':
          // 도메인 변경 없음 — History도 쓰지 않고 기존 409를 유지한다.
          throw new AppError('ADMIN_REVIEW_ALREADY_DELETED');
        case 'not_found':
          throw new AppError('ADMIN_REVIEW_NOT_FOUND');
        default: {
          const _exhaustive: never = result;
          return _exhaustive;
        }
      }
    })
  );
};
