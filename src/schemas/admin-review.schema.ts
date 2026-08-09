import { z } from 'zod';
import { listQuerySchema } from './admin-list-query.schema';
import { adminStatisticsFilterSchema } from './admin-statistics.schema';

/** Prisma Int 최대값 — Review.id(Int PK) 범위를 스키마에서 맞춘다. */
const PRISMA_INT_MAX = 2_147_483_647;

/**
 * 관리자 리뷰 목록 삭제 상태 필터.
 * ACTIVE=미삭제, DELETED=삭제됨.
 */
export const adminReviewDeletionStatusSchema = z.enum(['ACTIVE', 'DELETED']);

/**
 * 관리자 리뷰 목록 조회 Query.
 * rating은 리뷰 등록 Body와 동일하게 1~5 정수만 허용한다.
 * deletionStatus 미전달 시 ACTIVE로 기본 적용해 soft delete 리뷰가 기본 목록에 섞이지 않게 한다.
 * 작성일 기간은 statistics와 동일한 startDate/endDate 검증 정책을 재사용한다.
 */
export const adminReviewListQuerySchema = listQuerySchema
  .extend({
    rating: z.coerce.number().int().min(1).max(5).optional(),
    deletionStatus: adminReviewDeletionStatusSchema
      .optional()
      .default('ACTIVE'),
  })
  .and(adminStatisticsFilterSchema);

export type AdminReviewListQuery = z.infer<typeof adminReviewListQuerySchema>;

/**
 * 관리자 리뷰 삭제 Path Params.
 * Review.id(Int PK)와 맞추고, Express params 문자열은 coerce로 숫자 변환한다.
 * Prisma Int 상한을 넘어가는 값은 400(ADMIN_INVALID_QUERY_PARAM)으로 거절한다.
 */
export const adminReviewParamsSchema = z.object({
  reviewId: z.coerce.number().int().positive().max(PRISMA_INT_MAX),
});

export type AdminReviewParams = z.infer<typeof adminReviewParamsSchema>;
