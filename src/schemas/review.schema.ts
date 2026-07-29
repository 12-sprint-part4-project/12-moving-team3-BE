import { z } from 'zod';

const MIN_REVIEW_CONTENT_LENGTH = 10;
const MAX_REVIEW_CONTENT_LENGTH = 600;

/** 리뷰 등록·수정 Body */
export const reviewBodySchema = z.object({
  rating: z.number().int().min(1).max(5),
  content: z
    .string()
    .trim()
    .min(MIN_REVIEW_CONTENT_LENGTH)
    .max(MAX_REVIEW_CONTENT_LENGTH),
});

export type ReviewBody = z.infer<typeof reviewBodySchema>;

/** Path Parameter: reviewId 숫자 변환 및 필수 검증 */
export const reviewIdParamsSchema = z.object({
  reviewId: z.coerce.number().int().positive(),
});

export type ReviewIdParams = z.infer<typeof reviewIdParamsSchema>;

/** 리뷰 목록 조회 Query (page / limit 페이지네이션) */
export const reviewListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(6).optional().default(6),
});

export type ReviewListQuery = z.infer<typeof reviewListQuerySchema>;

/** 리뷰 작성 가능한 견적 조회 Query (page / limit 페이지네이션) */
export const reviewWritableQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(6).optional().default(6),
});

export type ReviewWritableQuery = z.infer<typeof reviewWritableQuerySchema>;
