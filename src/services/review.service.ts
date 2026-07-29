import { EstimateRequestStatus, Prisma, QuoteStatus } from '@prisma/client';
import * as quoteRepository from '../repositories/quote.repository';
import type { QuoteForReviewCreate } from '../repositories/quote.repository';
import reviewRepository from '../repositories/review.repository';
import type { ReviewBody } from '../schemas/review.schema';
import { AppError } from '../utils/app.error';
import { isMoveDateReached } from '../utils/date.util';

/** 목록 조회 공통 페이지네이션 메타 */
export interface ReviewPaginationMeta {
  totalCount: number;
  totalPages: number;
  currentPage: number;
  limit: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
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

// TODO: DTO 정의 후 반환 타입 구체화
type ReviewListResult = {
  items: unknown[];
  meta: ReviewPaginationMeta;
};

type ReviewDetail = {
  id: number;
  quoteId: number;
  rating: number;
  content: string;
  createdAt: Date;
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
    throw new AppError('FORBIDDEN');
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
  _input: GetMoverReviewsInput
): Promise<ReviewListResult> => {
  // TODO: implement
  throw new Error('Not implemented');
};

export const getCustomerWritableQuotes = async (
  _input: GetCustomerWritableQuotesInput
): Promise<ReviewListResult> => {
  // TODO: implement
  throw new Error('Not implemented');
};

export const getCustomerReviews = async (
  _input: GetCustomerReviewsInput
): Promise<ReviewListResult> => {
  // TODO: implement
  throw new Error('Not implemented');
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

      // 3. 기존 리뷰가 존재하는지(soft-delete 포함) — unique 충돌 전 사전 차단
      //TODO: 만약 리뷰가 삭제된 이후에, 리뷰를 추가할 수 있다면, DB의 리뷰테이블 unique 조건을 없애야 함. (@@unique([userId, quoteId]))
      //위 조건을 없앤다면, delete상태가 아닌 리뷰가 존재하는지 확인하는 로직으로 바뀌어야 할 것. (delete상태인 리뷰는 존재해도 됨)
      const existingReview = await reviewRepository.findReviewByUserAndQuote(
        customerId,
        quoteId,
        tx
      );
      if (existingReview) {
        throw new AppError('REVIEW_ALREADY_EXISTS');
      }

      // 4. 리뷰 생성 (동시 요청은 unique(userId, quoteId) + P2002로 여기서도 방어함.)
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

  // 1. 활성 리뷰 조회
  const existingReview =
    await reviewRepository.findActiveReviewById(reviewId);

  if (!existingReview) {
    throw new AppError('REVIEW_NOT_FOUND');
  }

  // 2. 작성자 본인만 수정 가능 (명세상 404로 통일)
  if (existingReview.userId !== customerId) {
    throw new AppError('REVIEW_NOT_FOUND');
  }

  // 3. rating · content 필수 수정
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

export const deleteReview = async (
  _input: DeleteReviewInput
): Promise<void> => {
  // TODO: implement
  throw new Error('Not implemented');
};
