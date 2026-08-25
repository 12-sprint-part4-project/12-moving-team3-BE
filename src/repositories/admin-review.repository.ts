import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import type { AdminReviewListQuery } from '../schemas/admin-review.schema';
import { createDateRange } from '../utils/admin-date-range.util';

type DbClient = typeof prisma | Prisma.TransactionClient;

export const getReviewCount = async (where: Prisma.ReviewWhereInput) => {
  return prisma.review.count({ where });
};

export const getAverageReviewScore = async (where: Prisma.ReviewWhereInput) => {
  const result = await prisma.review.aggregate({
    where,
    _avg: {
      rating: true,
    },
  });

  return result._avg.rating ?? 0;
};

/** 작성자·기사 공통 User select — 목록 식별용 최소 필드 */
const adminReviewUserSelect = {
  id: true,
  name: true,
  nickname: true,
  email: true,
  userType: true,
} satisfies Prisma.UserSelect;

/**
 * 관리자 리뷰 목록 select.
 * Review 필드 + 작성자(user) + 기사(quote.mover). quote.mover는 schema상 nullable.
 */
const adminReviewListSelect = {
  id: true,
  userId: true,
  quoteId: true,
  rating: true,
  content: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  user: {
    select: adminReviewUserSelect,
  },
  quote: {
    select: {
      mover: {
        select: adminReviewUserSelect,
      },
    },
  },
} satisfies Prisma.ReviewSelect;

export type AdminReviewListRow = Prisma.ReviewGetPayload<{
  select: typeof adminReviewListSelect;
}>;

/** 이름 또는 닉네임 부분 일치 — 작성자·기사 검색에 공통으로 쓴다. */
const buildUserNameOrNicknameWhere = (
  userName: string
): Prisma.UserWhereInput => ({
  OR: [
    { name: { contains: userName, mode: 'insensitive' } },
    { nickname: { contains: userName, mode: 'insensitive' } },
  ],
});

/**
 * 목록/카운트 공통 where.
 * deletionStatus 미전달 시 deletedAt 조건을 두지 않아 전체를 조회한다.
 * 작성일 기간은 통계와 동일한 createDateRange를 쓴다.
 */
export const buildAdminReviewListWhere = (
  params: Pick<
    AdminReviewListQuery,
    | 'id'
    | 'userName'
    | 'moverName'
    | 'rating'
    | 'deletionStatus'
    | 'startDate'
    | 'endDate'
  >
): Prisma.ReviewWhereInput => {
  const dateRange = createDateRange(params.startDate, params.endDate);
  const where: Prisma.ReviewWhereInput = {
    ...(dateRange && { createdAt: dateRange }),
  };

  if (params.id !== undefined) {
    where.id = params.id;
  }

  if (params.rating !== undefined) {
    where.rating = params.rating;
  }

  if (params.deletionStatus === 'ACTIVE') {
    where.deletedAt = null;
  } else if (params.deletionStatus === 'DELETED') {
    where.deletedAt = { not: null };
  }

  if (params.userName) {
    where.user = buildUserNameOrNicknameWhere(params.userName);
  }

  if (params.moverName) {
    where.quote = {
      mover: buildUserNameOrNicknameWhere(params.moverName),
    };
  }

  return where;
};

/** 관리자 리뷰 목록 + 전체 건수 (totalPages는 Service에서 계산) */
export const findAdminReviewsWithCount = async (
  params: AdminReviewListQuery
): Promise<{ items: AdminReviewListRow[]; totalCount: number }> => {
  const where = buildAdminReviewListWhere(params);
  const skip = (params.page - 1) * params.pageSize;

  const [items, totalCount] = await prisma.$transaction([
    prisma.review.findMany({
      where,
      select: adminReviewListSelect,
      // createdAt이 같으면 id desc로 tie-break해 offset 페이지네이션 순서를 안정화한다.
      // 날짜만 뒤집고 id는 고정해 견적 요청 목록과 같은 보조 정렬을 유지한다.
      orderBy:
        params.sort === 'ASC'
          ? [{ createdAt: 'asc' }, { id: 'desc' }]
          : [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take: params.pageSize,
    }),
    prisma.review.count({ where }),
  ]);

  return { items, totalCount };
};

/** 리뷰 단건 조회. 없으면 null을 반환하고 404 판단은 Service에서 한다. */
export const findAdminReviewById = async (
  reviewId: number
): Promise<AdminReviewListRow | null> => {
  return prisma.review.findUnique({
    where: { id: reviewId },
    select: adminReviewListSelect,
  });
};

/** 목록 필터·정렬 기준 인접 건 조회. id만 필요하므로 select를 최소로 둔다. */
export const findAdminReviewFirst = async (
  where: Prisma.ReviewWhereInput,
  orderBy: Prisma.ReviewOrderByWithRelationInput[]
): Promise<{ id: number } | null> => {
  return prisma.review.findFirst({
    where,
    orderBy,
    select: { id: true },
  });
};

/**
 * 관리자 리뷰 soft delete 결과.
 * updateMany(count=0)만으로는 미존재/이미 삭제를 구분할 수 없어 실패 시 한 번 더 조회한다.
 * (신고 콘텐츠 soft delete와 동일한 구분 방식)
 */
export type SoftDeleteAdminReviewResult =
  | { kind: 'deleted'; id: number; deletedAt: Date }
  | { kind: 'already_deleted'; id: number }
  | { kind: 'not_found' };

/**
 * 관리자 리뷰 soft delete.
 * 물리 삭제하지 않고 deletedAt만 갱신한다.
 * id + deletedAt IS NULL 조건부 갱신으로 동시 삭제 시 한 요청만 성공하게 한다.
 * History와 원자성을 맞추려면 호출부가 tx를 넘긴다.
 */
export const softDeleteAdminReview = async (
  reviewId: number,
  deletedAt: Date = new Date(),
  db: DbClient = prisma
): Promise<SoftDeleteAdminReviewResult> => {
  const updateResult = await db.review.updateMany({
    where: { id: reviewId, deletedAt: null },
    data: { deletedAt },
  });

  if (updateResult.count === 1) {
    return { kind: 'deleted', id: reviewId, deletedAt };
  }

  const review = await db.review.findUnique({
    where: { id: reviewId },
    select: { id: true, deletedAt: true },
  });

  if (!review) {
    return { kind: 'not_found' };
  }

  // 행은 있으나 조건부 갱신이 실패한 경우 — 이미 soft delete된 것으로 본다.
  return { kind: 'already_deleted', id: review.id };
};
