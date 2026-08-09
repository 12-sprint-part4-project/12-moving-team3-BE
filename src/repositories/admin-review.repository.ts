import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import type { AdminReviewListQuery } from '../schemas/admin-review.schema';

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

/** User 식별 정보 검색 — 회원/채팅 목록과 동일한 contains + insensitive */
const buildUserSearchOr = (search: string): Prisma.UserWhereInput['OR'] => [
  { name: { contains: search, mode: 'insensitive' } },
  { nickname: { contains: search, mode: 'insensitive' } },
  { email: { contains: search, mode: 'insensitive' } },
  { phoneNumber: { contains: search, mode: 'insensitive' } },
];

/**
 * 목록/카운트 공통 where.
 * soft delete된 리뷰는 항상 제외한다.
 */
const buildAdminReviewListWhere = (
  params: Pick<AdminReviewListQuery, 'search' | 'rating'>
): Prisma.ReviewWhereInput => {
  const where: Prisma.ReviewWhereInput = {
    deletedAt: null,
  };

  if (params.rating !== undefined) {
    where.rating = params.rating;
  }

  // search가 있을 때만 OR를 붙인다 — 빈 문자열은 스키마에서 제거된다.
  if (params.search) {
    where.OR = [
      { content: { contains: params.search, mode: 'insensitive' } },
      // Review.user — 작성자(고객)
      { user: { OR: buildUserSearchOr(params.search) } },
      // Review.quote.mover — 기사 (moverId가 null인 견적은 이 분기에 매칭되지 않음)
      { quote: { mover: { OR: buildUserSearchOr(params.search) } } },
    ];
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
      // createdAt이 같으면 id로 tie-break해 offset 페이지네이션 순서를 안정화한다.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take: params.pageSize,
    }),
    prisma.review.count({ where }),
  ]);

  return { items, totalCount };
};
