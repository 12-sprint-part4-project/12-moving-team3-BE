import { z } from 'zod';

/** 목록 조회 기본 페이지 크기 */
const DEFAULT_LIST_PAGE_SIZE = 10;

/**
 * 목록 조회 pageSize 상한.
 * page 기반 목록인 quoteListQuerySchema의 limit.max(50) 정책을 따른다.
 */
const MAX_LIST_PAGE_SIZE = 50;

/** 공통 목록 조회 Query (search + page/pageSize) */
export const listQuerySchema = z.object({
  // 검색어는 앞뒤 공백을 제거하고, 빈 문자열은 조건으로 쓰지 않는다.
  search: z.string().trim().min(1).optional(),
  // URL query는 문자열이므로 coerce로 숫자 변환하고, 1페이지부터만 허용한다.
  page: z.coerce.number().int().min(1).optional().default(1),
  // 과도한 조회를 막기 위해 상한을 두고, 미전달 시 기본 pageSize를 적용한다.
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_LIST_PAGE_SIZE)
    .optional()
    .default(DEFAULT_LIST_PAGE_SIZE),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

export const sortDirectionSchema = z
  .enum(['ASC', 'DESC'])
  .optional()
  .default('DESC');

export type SortDirection = z.infer<typeof sortDirectionSchema>;
