import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

const reviewRepository = {
  getReviewsByMoverId: async (
    moverId: string,
    tx?: Prisma.TransactionClient
  ) => {
    const dbClient = tx ?? prisma;
    return dbClient.review.findMany({
      where: {
        deletedAt: null,
        quote: { moverId },
      },
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
    });
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
      // const score = review.rating as 1 | 2 | 3 | 4 | 5;
      // ratingCounts[score] += 1;
      // ratingSum += score;

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
};

export default reviewRepository;
