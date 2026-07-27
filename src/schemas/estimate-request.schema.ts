import { MoveType } from '@prisma/client';
import { z } from 'zod';

export const ESTIMATE_REQUEST_SORT_VALUES = [
  'MOVE_DATE_ASC',
  'CREATED_AT_ASC',
] as const;

export type EstimateRequestSort = (typeof ESTIMATE_REQUEST_SORT_VALUES)[number];

/**
 * moveType 쿼리 파라미터를 배열 형식으로 정규화
 * `?moveType=SMALL&moveType=HOME` 형태와 `?moveType=SMALL,HOME` 형태를 모두 지원
 */
const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => String(item).split(','));
  }

  return String(value).split(',');
};

// moveType 쿼리를 배열로 전처리한 뒤 MoveType Enum 값으로 검증
const moveTypeArraySchema = z.preprocess(
  (value) => (value === undefined ? undefined : toStringArray(value)),
  z.array(z.enum(MoveType)).min(1)
);

// 'true'/'false' 문자열을 boolean 형식으로 변환
const booleanQuerySchema = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

export const estimateRequestListQuerySchema = z.object({
  keyword: z.string().trim().min(1).optional(),
  moveType: moveTypeArraySchema.optional(),
  designated: booleanQuerySchema.optional(),
  serviceArea: booleanQuerySchema.optional(),
  sort: z
    .enum(ESTIMATE_REQUEST_SORT_VALUES)
    .optional()
    .default('MOVE_DATE_ASC'),
  cursor: z.string().min(1).optional(),
  // 무한 스크롤 기본 페이지당 조회 개수
  limit: z.coerce.number().int().min(1).max(20).optional().default(10),
});

export type EstimateRequestListQuery = z.infer<
  typeof estimateRequestListQuerySchema
>;
