import type { ReviewBody } from '../schemas/review.schema';

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

type ReviewDetail = unknown;

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
  _input: CreateReviewInput
): Promise<ReviewDetail> => {
  // TODO: implement
  throw new Error('Not implemented');
};

export const updateReview = async (
  _input: UpdateReviewInput
): Promise<ReviewDetail> => {
  // TODO: implement
  throw new Error('Not implemented');
};

export const deleteReview = async (
  _input: DeleteReviewInput
): Promise<void> => {
  // TODO: implement
  throw new Error('Not implemented');
};
