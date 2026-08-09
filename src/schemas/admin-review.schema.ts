import { z } from 'zod';
import { listQuerySchema } from './admin-list-query.schema';

/**
 * 관리자 리뷰 목록 조회 Query.
 * rating은 리뷰 등록 Body(reviewBodySchema)와 동일하게 1~5 정수만 허용한다.
 */
export const adminReviewListQuerySchema = listQuerySchema.extend({
  rating: z.coerce.number().int().min(1).max(5).optional(),
});

export type AdminReviewListQuery = z.infer<typeof adminReviewListQuerySchema>;

/**
 * 관리자 리뷰 삭제 Path Params.
 * Review.id(Int PK)와 맞추고, Express params 문자열은 coerce로 숫자 변환한다.
 */
export const adminReviewParamsSchema = z.object({
  reviewId: z.coerce.number().int().positive(),
});

export type AdminReviewParams = z.infer<typeof adminReviewParamsSchema>;
