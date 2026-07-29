import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export type ReviewTransactionClient = Prisma.TransactionClient;

/** 리뷰 목록 페이지네이션 파라미터 */
export interface ReviewPaginationParams {
  page: number;
  limit: number;
}

const reviewDetailSelect = {
  id: true,
  quoteId: true,
  rating: true,
  content: true,
  createdAt: true,
} satisfies Prisma.ReviewSelect;

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
              name: true,
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
   * 기사(User id) 한 명의 리뷰 통계를 만든다.
   * 반환: 평점별 개수, 총 개수, 평균 평점
   */
  getReviewStatsByMoverId: async (
    moverId: string,
    tx?: Prisma.TransactionClient
  ) => {
    const dbClient = tx ?? prisma;

    // 1) 이 기사 견적에 달린 리뷰의 rating만 가져온다 (삭제된 리뷰 제외)
    const reviews = await dbClient.review.findMany({
      where: {
        deletedAt: null,
        quote: { moverId },
      },
      select: {
        rating: true,
      },
    });

    // 2) 1~5점 개수를 0으로 준비해 둔다
    const ratingCounts = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };

    // 3) 리뷰를 하나씩 보며 개수와 합계를 구한다
    let ratingSum = 0;

    for (const review of reviews) {
      const score = review.rating;
      if (score in ratingCounts) {
        ratingCounts[score as keyof typeof ratingCounts] += 1;
        ratingSum += score;
      }
    }

    // 4) 총 개수 · 평균 (리뷰 없으면 평균은 null)
    const totalCount = reviews.length;
    const averageRating =
      totalCount === 0 ? null : Math.round((ratingSum / totalCount) * 10) / 10; // 소수 1자리

    return {
      ratingCounts,
      totalCount,
      averageRating,
    };
  },

  /**
   * userId+quoteId unique 기준 리뷰 조회 (soft-delete 포함)
   * 동시성: unique 충돌 전 사전 확인 및 삭제된 리뷰 재작성 차단용
   */
  findReviewByUserAndQuote: async (
    userId: string,
    quoteId: number,
    tx?: Prisma.TransactionClient
  ) => {
    const dbClient = tx ?? prisma;

    return dbClient.review.findUnique({
      where: {
        userId_quoteId: {
          userId,
          quoteId,
        },
      },
      select: {
        id: true,
        deletedAt: true,
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

  /** 활성 리뷰 단건 조회 (삭제된 리뷰 제외) */
  findActiveReviewById: async (
    reviewId: number,
    tx?: Prisma.TransactionClient
  ) => {
    const dbClient = tx ?? prisma;

    return dbClient.review.findFirst({
      where: {
        id: reviewId,
        deletedAt: null,
      },
      select: {
        ...reviewDetailSelect,
        userId: true,
      },
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
