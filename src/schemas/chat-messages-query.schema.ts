import { z } from 'zod';

/** URL query에서 10진수 숫자 문자열만 허용한다. 1e3·0x64 등 Number() 특수 표기는 거부한다. */
const DECIMAL_INT_QUERY_STRING = /^\d+$/;

/**
 * Query string → 범위 제한 integer.
 * 문자열 단계에서 10진수 자릿수만 통과시킨 뒤 number로 변환한다.
 */
const decimalIntQuerySchema = (params: { min: number; max?: number }) => {
  let numberSchema = z.number().int().min(params.min);

  if (params.max !== undefined) {
    numberSchema = numberSchema.max(params.max);
  }

  return z
    .string()
    .regex(DECIMAL_INT_QUERY_STRING)
    .transform((value) => Number(value))
    .pipe(numberSchema);
};

/**
 * 채팅 메시지 커서 조회 공통 Query.
 * 사용자·관리자 메시지 API가 동일한 before/limit 계약을 공유한다.
 */
export const chatMessagesQuerySchema = z.object({
  before: decimalIntQuerySchema({ min: 1 }).optional(),
  limit: decimalIntQuerySchema({ min: 1, max: 100 }).optional().default(30),
});

export type ChatMessagesQuery = z.infer<typeof chatMessagesQuerySchema>;
