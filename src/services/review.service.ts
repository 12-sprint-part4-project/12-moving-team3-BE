import { EstimateRequestStatus, Prisma, QuoteStatus } from '@prisma/client';
import type { MoveType } from '@prisma/client';
import * as quoteRepository from '../repositories/quote.repository';
import type { QuoteForReviewCreate } from '../repositories/quote.repository';
import reviewRepository from '../repositories/review.repository';
import type { ReviewBody } from '../schemas/review.schema';
import { AppError } from '../utils/app.error';
import { isMoveDateReached } from '../utils/date.util';
import * as notificationService from './notification.service';
import { toPublicViewUrl } from './s3.service';

/** 목록 조회 공통 페이지네이션 메타 */
export interface ReviewPaginationMeta {
  currentPage: number;
  pageSize: number;
  totalCount: number;
  hasNextPage: boolean;
}

export interface ReviewRatingStatistics {
  average: number;
  five: number;
  four: number;
  three: number;
  two: number;
  one: number;
}

export interface GetMoverReviewsInput {
  moverId: string;
  page: number;
  limit: number;
}

export interface GetCustomerWritableQuotesInput {
  customerId: string;
  page: number;
  limit: number;
}

export interface GetCustomerReviewsInput {
  customerId: string;
  page: number;
  limit: number;
}

export interface CreateReviewInput {
  customerId: string;
  quoteId: number;
  body: ReviewBody;
}

export interface UpdateReviewInput {
  customerId: string;
  reviewId: number;
  body: ReviewBody;
}

export interface DeleteReviewInput {
  customerId: string;
  reviewId: number;
}

interface MoverReviewListItem {
  id: number;
  rating: number;
  content: string;
  createdAt: Date;
  customer: {
    id: string;
    nickname: string;
  };
}

interface GetMoverReviewsResult {
  reviews: MoverReviewListItem[];
  meta: {
    pagination: ReviewPaginationMeta;
    ratingStatistics: ReviewRatingStatistics;
  };
}

interface CustomerReviewListItem {
  id: number;
  rating: number;
  content: string;
  createdAt: Date;
  mover: {
    id: string;
    name: string;
    profileImageUrl: string | null;
  } | null;
  quote: {
    id: number;
    moveType: MoveType | null;
    moveDate: string | null;
    price: number | null;
    isDesignated: boolean;
  } | null;
}

interface GetCustomerReviewsResult {
  reviews: CustomerReviewListItem[];
  meta: {
    pagination: ReviewPaginationMeta;
  };
}

interface WritableQuoteListItem {
  quoteId: number;
  moveType: MoveType | null;
  isDesignated: boolean;
  moveDate: string | null;
  price: number | null;
  mover: {
    id: string;
    name: string;
    profileImageUrl: string | null;
  } | null;
}

interface GetCustomerWritableQuotesResult {
  writableQuotes: WritableQuoteListItem[];
  meta: {
    pagination: ReviewPaginationMeta;
  };
}

interface ReviewDetail {
  id: number;
  quoteId: number;
  rating: number;
  content: string;
  createdAt: Date;
}

/** Date(@db.Date) → YYYY-MM-DD */
const formatDateOnly = (date: Date | null): string | null => {
  if (!date) {
    return null;
  }

  return date.toISOString().slice(0, 10);
};

const isUniqueConstraintError = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';

/**
 * 리뷰 작성 가능 여부
 * - 확정된 견적(CONFIRMED)이며 요청의 confirmedQuote 와 일치
 * - 이사 완료(COMPLETED) 이거나 이사일 당일(포함) 이후
 */
const assertReviewWritable = (
  quote: QuoteForReviewCreate,
  customerId: string
): void => {
  const { estimateRequest } = quote;

  if (estimateRequest.userId !== customerId) {
    throw new AppError('REVIEW_FORBIDDEN');
  }

  const isConfirmedQuote =
    quote.status === QuoteStatus.CONFIRMED &&
    estimateRequest.confirmedQuoteId === quote.id;

  const isMoveCompleted =
    estimateRequest.status === EstimateRequestStatus.COMPLETED ||
    isMoveDateReached(estimateRequest.moveDate);

  if (!isConfirmedQuote || !isMoveCompleted) {
    throw new AppError('REVIEW_NOT_WRITABLE');
  }
};

export const getMoverReviews = async (
  input: GetMoverReviewsInput
): Promise<GetMoverReviewsResult> => {
  const { moverId, page, limit } = input;

  const [listResult, stats] = await Promise.all([
    reviewRepository.getReviewsByMoverId(moverId, { page, limit }),
    reviewRepository.getReviewStatsByMoverId(moverId),
  ]);

  const reviews: MoverReviewListItem[] = listResult.items.map((review) => ({
    id: review.id,
    rating: review.rating,
    content: review.content,
    createdAt: review.createdAt,
    customer: {
      id: review.user.id,
      nickname: review.user.nickname,
    },
  }));

  return {
    reviews,
    meta: {
      pagination: {
        currentPage: page,
        pageSize: limit,
        totalCount: listResult.totalCount,
        hasNextPage: page * limit < listResult.totalCount,
      },
      ratingStatistics: {
        average: stats.averageRating ?? 0,
        five: stats.ratingCounts[5],
        four: stats.ratingCounts[4],
        three: stats.ratingCounts[3],
        two: stats.ratingCounts[2],
        one: stats.ratingCounts[1],
      },
    },
  };
};

export const getCustomerWritableQuotes = async (
  input: GetCustomerWritableQuotesInput
): Promise<GetCustomerWritableQuotesResult> => {
  const { customerId, page, limit } = input;

  const listResult = await quoteRepository.findWritableQuotesByCustomerId(
    customerId,
    { page, limit }
  );

  const writableQuotes: WritableQuoteListItem[] = await Promise.all(
    listResult.items.map(async (quote) => ({
      quoteId: quote.id,
      moveType: quote.estimateRequest.moveType,
      isDesignated: quote.isDesignated,
      moveDate: formatDateOnly(quote.estimateRequest.moveDate),
      price: quote.price,
      mover: quote.mover
        ? {
            id: quote.mover.id,
            name: quote.mover.name,
            profileImageUrl: toPublicViewUrl(
              quote.mover.profileImageKey
            ),
          }
        : null,
    }))
  );

  return {
    writableQuotes,
    meta: {
      pagination: {
        currentPage: page,
        pageSize: limit,
        totalCount: listResult.totalCount,
        hasNextPage: page * limit < listResult.totalCount,
      },
    },
  };
};

export const getCustomerReviews = async (
  input: GetCustomerReviewsInput
): Promise<GetCustomerReviewsResult> => {
  const { customerId, page, limit } = input;

  const listResult = await reviewRepository.getReviewsByCustomerId(customerId, {
    page,
    limit,
  });

  const reviews: CustomerReviewListItem[] = await Promise.all(
    listResult.items.map(async (review) => {
      const quote = review.quote;

      return {
        id: review.id,
        rating: review.rating,
        content: review.content,
        createdAt: review.createdAt,
        mover: quote?.mover
          ? {
              id: quote.mover.id,
              name: quote.mover.name,
              profileImageUrl: toPublicViewUrl(
                quote.mover.profileImageKey
              ),
            }
          : null,
        quote: quote
          ? {
              id: quote.id,
              moveType: quote.estimateRequest.moveType,
              moveDate: formatDateOnly(quote.estimateRequest.moveDate),
              price: quote.price,
              isDesignated: quote.isDesignated,
            }
          : null,
      };
    })
  );

  return {
    reviews,
    meta: {
      pagination: {
        currentPage: page,
        pageSize: limit,
        totalCount: listResult.totalCount,
        hasNextPage: page * limit < listResult.totalCount,
      },
    },
  };
};
export const createReview = async (
  input: CreateReviewInput
): Promise<ReviewDetail> => {
  const {
    customerId,
    quoteId,
    body: { rating, content },
  } = input;

  try {
    const review = await reviewRepository.runInTransaction(async (tx) => {
      // 1. 견적 존재 여부 확인
      const quote = await quoteRepository.findQuoteForReviewCreate(quoteId, tx);
      if (!quote) {
        throw new AppError('QUOTE_NOT_FOUND');
      }

      // 2. 견적이 리뷰 작성 가능 상태인지 확인
      // 견적의 고객이 유저가 맞는지 & 견적이 작성 가능한 상태인지(견적 확정&이사완료)
      assertReviewWritable(quote, customerId);

      // 3. 활성 리뷰만 중복으로 본다 — soft-delete된 이전 리뷰가 있어도 재작성 허용
      // DB: reviews_user_id_quote_id_active_unique (WHERE deleted_at IS NULL)
      const activeReview =
        await reviewRepository.findActiveReviewByUserAndQuote(
          customerId,
          quoteId,
          tx
        );
      if (activeReview) {
        throw new AppError('REVIEW_ALREADY_EXISTS');
      }

      // 4. 리뷰 생성 (동시 생성 race는 partial unique + P2002로 방어)
      return reviewRepository.createReview(
        {
          userId: customerId,
          quoteId,
          rating,
          content,
        },
        tx
      );
    });

    // 알림 실패가 리뷰 작성을 막지 않도록 커밋 이후 try/catch
    try {
      await notificationService.notifyReviewWrittenByReviewId(review.id);
    } catch (error) {
      console.error(
        `[createReview] review written notification failed reviewId=${review.id}`,
        error
      );
    }

    return review;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppError('REVIEW_ALREADY_EXISTS');
    }

    throw error;
  }
};

export const updateReview = async (
  input: UpdateReviewInput
): Promise<ReviewDetail> => {
  const {
    customerId,
    reviewId,
    body: { rating, content },
  } = input;

  // 소유권·삭제 여부는 updateReview의 where 조건으로 함께 검증됨 (실패 시 null 반환)
  const updatedReview = await reviewRepository.updateReview({
    reviewId,
    userId: customerId,
    rating,
    content,
  });

  if (!updatedReview) {
    throw new AppError('REVIEW_NOT_FOUND');
  }

  return updatedReview;
};

export const deleteReview = async (input: DeleteReviewInput): Promise<void> => {
  const { customerId, reviewId } = input;

  const deletedCount = await reviewRepository.softDeleteReview({
    reviewId,
    userId: customerId,
  });

  if (deletedCount === 0) {
    throw new AppError('REVIEW_NOT_FOUND');
  }
};
