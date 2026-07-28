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

// --- 일반 유저 견적요청 (DRAFT → SUBMITTED) ---

export const TOTAL_INPUT_STEPS = 3;
export const TOTAL_PROGRESS_STEPS = 4;

/** path :estimateRequestId — 스키마 PK 가 Int */
export const estimateRequestIdParamsSchema = z.object({
  estimateRequestId: z.coerce.number().int().positive(),
});

export type EstimateRequestIdParams = z.infer<
  typeof estimateRequestIdParamsSchema
>;

const moveTypeSchema = z.enum(MoveType);

/** YYYY-MM-DD 형식의 이사 날짜 문자열 */
const moveDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식이 올바르지 않습니다.');

const addressFieldSchema = z.string().trim().min(1);

const step1DataSchema = z.object({
  moveType: moveTypeSchema,
});

const step2DataSchema = z.object({
  moveDate: moveDateSchema,
});

const step3DataSchema = z.object({
  departureZipCode: addressFieldSchema,
  departureAddress: addressFieldSchema,
  departureDetailAddress: addressFieldSchema,
  arrivalZipCode: addressFieldSchema,
  arrivalAddress: addressFieldSchema,
  arrivalDetailAddress: addressFieldSchema,
});

/** 단계별 입력 저장 — FE 스텝 1~3 (출발지+도착지는 step 3 일괄) */
export const saveEstimateRequestStepBodySchema = z.discriminatedUnion('step', [
  z.object({
    step: z.literal(1),
    data: step1DataSchema,
  }),
  z.object({
    step: z.literal(2),
    data: step2DataSchema,
  }),
  z.object({
    step: z.literal(3),
    data: step3DataSchema,
  }),
]);

export type SaveEstimateRequestStepBody = z.infer<
  typeof saveEstimateRequestStepBodySchema
>;

export const ESTIMATE_REQUEST_REVISABLE_FIELDS = [
  'moveType',
  'moveDate',
  'departureZipCode',
  'departureAddress',
  'departureDetailAddress',
  'arrivalZipCode',
  'arrivalAddress',
  'arrivalDetailAddress',
] as const;

export type EstimateRequestRevisableField =
  (typeof ESTIMATE_REQUEST_REVISABLE_FIELDS)[number];

/** 완료 항목 재수정 — field + value 단건 수정 */
export const reviseEstimateRequestFieldBodySchema = z.object({
  field: z.enum(ESTIMATE_REQUEST_REVISABLE_FIELDS),
  value: z.string().trim().min(1),
});

export type ReviseEstimateRequestFieldBody = z.infer<
  typeof reviseEstimateRequestFieldBodySchema
>;
