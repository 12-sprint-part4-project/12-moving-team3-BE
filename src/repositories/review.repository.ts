import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export type ReviewTransactionClient = Prisma.TransactionClient;

/** 리뷰 목록 페이지네이션 파라미터 */
export interface ReviewPaginationParams {
  page: number;
  limit: number;
}

/** 기사 리뷰 평점 분포·평균 (목록/상세 공통) */
export interface ReviewRatingCounts {
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
}

export interface ReviewStats {
  ratingCounts: ReviewRatingCounts;
  totalCount: number;
  averageRating: number | null;
}

const reviewDetailSelect = {
  id: true,
  quoteId: true,
  rating: true,
  content: true,
  createdAt: true,
} satisfies Prisma.ReviewSelect;

const emptyReviewStats = (): ReviewStats => ({
  ratingCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  totalCount: 0,
  averageRating: null,
});

/** GROUP BY rating 결과 → ReviewStats (앱에서는 합산·평균만) */
const toReviewStatsFromRatingRows = (
  rows: Array<{ rating: number; count: number }>
): ReviewStats => {
  const ratingCounts: ReviewRatingCounts = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };
  let ratingSum = 0;
  let totalCount = 0;

  for (const row of rows) {
    const score = row.rating;
    const count = Number(row.count);
    if (score in ratingCounts) {
      ratingCounts[score as keyof ReviewRatingCounts] += count;
      ratingSum += score * count;
      totalCount += count;
    }
  }

  return {
    ratingCounts,
    totalCount,
    averageRating:
      totalCount === 0 ? null : Math.round((ratingSum / totalCount) * 10) / 10,
  };
};

/**
 * 기사 1명 리뷰 통계 — Prisma groupBy (DB COUNT)
 * quote.moverId로 필터 가능. 관계 필드 groupBy는 Prisma 미지원이라 배치 시 기사별 호출.
 */
const getReviewStatsForMover = async (
  moverId: string,
  dbClient: Prisma.TransactionClient | typeof prisma
): Promise<ReviewStats> => {
  const rows = await dbClient.review.groupBy({
    by: ['rating'],
    where: {
      deletedAt: null,
      quote: { moverId },
    },
    _count: { _all: true },
  });

  return toReviewStatsFromRatingRows(
    rows.map((row) => ({
      rating: row.rating,
      count: row._count._all,
    }))
  );
};

const reviewRepository = {
  /**
   * 기사에게 달린 리뷰 목록 (페이지네이션, 최신순)
   */
  getReviewsByMoverId: async (
    moverId: string,
    params: ReviewPaginationParams,
    tx?: Prisma.TransactionClient
  ) => {
    const dbClient = tx ?? prisma;
    const where: Prisma.ReviewWhereInput = {
      deletedAt: null,
      quote: { moverId },
    };
    const skip = (params.page - 1) * params.limit;

    const [items, totalCount] = await Promise.all([
      dbClient.review.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: params.limit,
        select: {
          id: true,
          rating: true,
          content: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              nickname: true,
            },
          },
        },
      }),
      dbClient.review.count({ where }),
    ]);

    return { items, totalCount };
  },

  /**
   * 고객이 작성한 리뷰 목록 (페이지네이션, 최신순)
   * quote / mover / estimateRequest 포함
   */
  getReviewsByCustomerId: async (
    customerId: string,
    params: ReviewPaginationParams,
    tx?: Prisma.TransactionClient
  ) => {
    const dbClient = tx ?? prisma;
    const where: Prisma.ReviewWhereInput = {
      deletedAt: null,
      userId: customerId,
    };
    const skip = (params.page - 1) * params.limit;

    const [items, totalCount] = await Promise.all([
      dbClient.review.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: params.limit,
        select: {
          id: true,
          rating: true,
          content: true,
          createdAt: true,
          quote: {
            select: {
              id: true,
              price: true,
              isDesignated: true,
              mover: {
                select: {
                  id: true,
                  name: true,
                  profileImageKey: true,
                },
              },
              estimateRequest: {
                select: {
                  moveType: true,
                  moveDate: true,
                },
              },
            },
          },
        },
      }),
      dbClient.review.count({ where }),
    ]);

    return { items, totalCount };
  },

  /**
   * 여러 기사의 리뷰 통계
   *
   * Prisma는 관계 필드(quote.moverId)로 groupBy 할 수 없어
   * 기사별 groupBy를 병렬 실행한다.
   * — 쿼리 수는 L회이지만 각 쿼리는 COUNT 집계만 하므로 전량 findMany N회보다 가벼움
   */
  getReviewStatsByMoverIds: async (
    moverIds: string[],
    tx?: Prisma.TransactionClient
  ): Promise<Map<string, ReviewStats>> => {
    const uniqueMoverIds = [...new Set(moverIds.filter(Boolean))];
    const result = new Map<string, ReviewStats>();

    if (uniqueMoverIds.length === 0) {
      return result;
    }

    const dbClient = tx ?? prisma;
    const statsList = await Promise.all(
      uniqueMoverIds.map((moverId) => getReviewStatsForMover(moverId, dbClient))
    );

    uniqueMoverIds.forEach((moverId, index) => {
      result.set(moverId, statsList[index] ?? emptyReviewStats());
    });

    return result;
  },

  /**
   * 기사(User id) 한 명의 리뷰 통계
   */
  getReviewStatsByMoverId: async (
    moverId: string,
    tx?: Prisma.TransactionClient
  ): Promise<ReviewStats> => {
    return getReviewStatsForMover(moverId, tx ?? prisma);
  },

  /**
   * 유저·견적에 대한 "활성" 리뷰 조회 (deletedAt IS NULL만)
   */
  findActiveReviewByUserAndQuote: async (
    userId: string,
    quoteId: number,
    tx?: Prisma.TransactionClient
  ) => {
    const dbClient = tx ?? prisma;

    return dbClient.review.findFirst({
      where: {
        userId,
        quoteId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });
  },

  /** 리뷰 생성 (권한·중복 검증은 service에서 처리) */
  createReview: async (
    data: {
      userId: string;
      quoteId: number;
      rating: number;
      content: string;
    },
    tx?: Prisma.TransactionClient
  ) => {
    const dbClient = tx ?? prisma;

    return dbClient.review.create({
      data: {
        userId: data.userId,
        quoteId: data.quoteId,
        rating: data.rating,
        content: data.content,
      },
      select: reviewDetailSelect,
    });
  },

  /**
   * 본인 활성 리뷰 수정
   * id + userId + deletedAt null 조건으로 소유권·삭제 여부를 함께 보장
   * updateMany + 재조회는 동일 트랜잭션에서 원자적으로 실행
   */
  updateReview: async (
    data: {
      reviewId: number;
      userId: string;
      rating: number;
      content: string;
    },
    tx?: Prisma.TransactionClient
  ) => {
    const execute = async (dbClient: ReviewTransactionClient) => {
      const where = {
        id: data.reviewId,
        userId: data.userId,
        deletedAt: null,
      };

      const result = await dbClient.review.updateMany({
        where,
        data: {
          rating: data.rating,
          content: data.content,
          updatedAt: new Date(),
        },
      });

      if (result.count === 0) {
        return null;
      }

      return dbClient.review.findFirst({
        where,
        select: reviewDetailSelect,
      });
    };

    if (tx) {
      return execute(tx);
    }

    return reviewRepository.runInTransaction(execute);
  },

  /**
   * 본인 활성 리뷰 soft delete
   * id + userId + deletedAt null — 없으면 count 0
   * updatedAt은 내용 수정 시각으로만 쓰므로 변경하지 않음
   */
  softDeleteReview: async (
    data: {
      reviewId: number;
      userId: string;
    },
    tx?: Prisma.TransactionClient
  ): Promise<number> => {
    const dbClient = tx ?? prisma;

    const result = await dbClient.review.updateMany({
      where: {
        id: data.reviewId,
        userId: data.userId,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    return result.count;
  },

  /** 리뷰 생성용 트랜잭션 래퍼 */
  runInTransaction: async <T>(
    handler: (tx: ReviewTransactionClient) => Promise<T>
  ): Promise<T> => {
    return prisma.$transaction(async (tx) => handler(tx));
  },
};

export default reviewRepository;
