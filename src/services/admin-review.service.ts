import { HistoryAction, Prisma, type UserType } from '@prisma/client';
import type {
  AdminReviewDetailDto,
  AdminReviewListItemDto,
  AdminReviewListResultDto,
  AdminReviewUserSummaryDto,
} from '../dtos/admin-review.dto';
import {
  runAuditedTransaction,
  runWithManualAudit,
} from '../lib/audit-context';
import {
  buildAdminReviewListWhere,
  findAdminReviewById,
  findAdminReviewFirst,
  findAdminReviewsWithCount,
  getAverageReviewScore,
  getReviewCount,
  softDeleteAdminReview,
  type AdminReviewListRow,
} from '../repositories/admin-review.repository';
import { createHistory } from '../repositories/history.repository';
import type {
  AdminReviewDetailQuery,
  AdminReviewListQuery,
} from '../schemas/admin-review.schema';
import type { SortDirection } from '../schemas/admin-list-query.schema';
import type { AdminStatisticsFilter } from '../schemas/admin-statistics.schema';
import { AppError } from '../utils/app.error';
import { createDateRange } from '../utils/admin-date-range.util';

/** History.tableName — Review @@map("reviews")와 동일 */
const REVIEW_TABLE_NAME = 'reviews';

/** toAdminReviewUserSummary 입력 — 목록 select의 user/mover 최소 필드 */
interface AdminReviewUserSummarySource {
  id: string;
  name: string;
  nickname: string;
  email: string;
  userType: UserType;
}

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
const toAdminReviewUserSummary = (
  user: AdminReviewUserSummarySource
): AdminReviewUserSummaryDto => ({
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
  deletedAt: row.deletedAt,
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
 * 목록과 같은 createdAt+id 정렬에서 이전·다음 ID를 찾는다.
 * createdAt은 null이 아니므로 견적 요청의 nullable 날짜 분기는 쓰지 않는다.
 */
const findAdminReviewNeighborIds = async (
  listWhere: Prisma.ReviewWhereInput,
  current: { id: number; createdAt: Date },
  sort: SortDirection
): Promise<{ prevId: number | null; nextId: number | null }> => {
  const inFilter = await findAdminReviewFirst(
    { AND: [listWhere, { id: current.id }] },
    [{ id: 'desc' }]
  );

  // 현재 리뷰가 목록 필터 밖이면 잘못된 prev/next를 주지 않는다.
  if (inFilter == null) {
    return { prevId: null, nextId: null };
  }

  const isAsc = sort === 'ASC';
  const prevWhere: Prisma.ReviewWhereInput = isAsc
    ? {
        OR: [
          { createdAt: { lt: current.createdAt } },
          { createdAt: current.createdAt, id: { gt: current.id } },
        ],
      }
    : {
        OR: [
          { createdAt: { gt: current.createdAt } },
          { createdAt: current.createdAt, id: { gt: current.id } },
        ],
      };
  const nextWhere: Prisma.ReviewWhereInput = isAsc
    ? {
        OR: [
          { createdAt: { gt: current.createdAt } },
          { createdAt: current.createdAt, id: { lt: current.id } },
        ],
      }
    : {
        OR: [
          { createdAt: { lt: current.createdAt } },
          { createdAt: current.createdAt, id: { lt: current.id } },
        ],
      };
  const prevOrderBy: Prisma.ReviewOrderByWithRelationInput[] = isAsc
    ? [{ createdAt: 'desc' }, { id: 'asc' }]
    : [{ createdAt: 'asc' }, { id: 'asc' }];
  const nextOrderBy: Prisma.ReviewOrderByWithRelationInput[] = isAsc
    ? [{ createdAt: 'asc' }, { id: 'desc' }]
    : [{ createdAt: 'desc' }, { id: 'desc' }];

  const [prev, next] = await Promise.all([
    findAdminReviewFirst({ AND: [listWhere, prevWhere] }, prevOrderBy),
    findAdminReviewFirst({ AND: [listWhere, nextWhere] }, nextOrderBy),
  ]);

  return {
    prevId: prev?.id ?? null,
    nextId: next?.id ?? null,
  };
};

/** 관리자 리뷰 상세 조회 */
export const getAdminReviewDetail = async (
  reviewId: number,
  query: AdminReviewDetailQuery
): Promise<AdminReviewDetailDto> => {
  const review = await findAdminReviewById(reviewId);

  if (!review) {
    throw new AppError('ADMIN_REVIEW_NOT_FOUND');
  }

  const listWhere = buildAdminReviewListWhere(query);
  const { prevId, nextId } = await findAdminReviewNeighborIds(
    listWhere,
    { id: review.id, createdAt: review.createdAt },
    query.sort ?? 'DESC'
  );

  return {
    ...toAdminReviewListItem(review),
    prevId,
    nextId,
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
