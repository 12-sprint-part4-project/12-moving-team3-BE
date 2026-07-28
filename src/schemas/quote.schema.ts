import { QuoteStatus } from '@prisma/client';
import { z } from 'zod';

// --- [기사님(MOVER)용 API] ---

// Path Parameter: estimateRequestId 숫자 변환 및 필수 검증.
export const quoteParamsSchema = z.object({
  estimateRequestId: z.coerce.number().int().positive(),
});

export type QuoteParams = z.infer<typeof quoteParamsSchema>;

// Path Parameter: quoteId 숫자 변환 및 필수 검증.
export const quoteIdParamsSchema = z.object({
  quoteId: z.coerce.number().int().positive(),
});

export type QuoteIdParams = z.infer<typeof quoteIdParamsSchema>;

/** 견적 목록 status 쿼리 허용 값 */
export const QUOTE_LIST_STATUS_VALUES = ['REJECTED', 'SENT'] as const;

export type QuoteListStatus = (typeof QUOTE_LIST_STATUS_VALUES)[number];

/** status=SENT 목록 조회 및 보낸 견적 권한 검증용 상태 */
export const SENT_QUOTE_STATUSES: QuoteStatus[] = [
  QuoteStatus.PENDING,
  QuoteStatus.CONFIRMED,
];

/** 목록 조회 기본 페이지 크기 */
const DEFAULT_QUOTE_LIST_LIMIT = 8;

// 보낸 견적 / 반려한 견적 목록 조회 Query 스키마.
export const quoteListQuerySchema = z.object({
  status: z.enum(QUOTE_LIST_STATUS_VALUES),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .default(DEFAULT_QUOTE_LIST_LIMIT),
});

export type QuoteListQuery = z.infer<typeof quoteListQuerySchema>;

/** 견적 금액 최대값 (10억) */
const MAX_QUOTE_PRICE = 1_000_000_000;

/** comment / rejectReason 최소, 최대 길이 (10자 ~ 500자) */
const MIN_TEXT_LENGTH = 10;
const MAX_TEXT_LENGTH = 500;

// 견적 보내기(PROPOSAL) Body 스키마
const proposalBodySchema = z.object({
  type: z.literal('PROPOSAL'),
  price: z.number().int().positive().max(MAX_QUOTE_PRICE),
  comment: z.string().trim().min(MIN_TEXT_LENGTH).max(MAX_TEXT_LENGTH),
});

// 반려하기(REJECTION) Body 스키마
const rejectionBodySchema = z.object({
  type: z.literal('REJECTION'),
  rejectReason: z.string().trim().min(MIN_TEXT_LENGTH).max(MAX_TEXT_LENGTH),
});

// type 필드 기준 Discriminated Union 검증.
export const quoteBodySchema = z.discriminatedUnion('type', [
  proposalBodySchema,
  rejectionBodySchema,
]);

export type QuoteBody = z.infer<typeof quoteBodySchema>;
export type ProposalBody = z.infer<typeof proposalBodySchema>;
export type RejectionBody = z.infer<typeof rejectionBodySchema>;

// --- [일반 유저(CUSTOMER)용 API] ---

/** 과거 견적 필터 허용 값 */
export const PAST_QUOTE_FILTER_VALUES = ['ALL', 'CONFIRMED'] as const;

export type PastQuoteFilter = (typeof PAST_QUOTE_FILTER_VALUES)[number];

/** 과거 견적 목록 기본 페이지 크기 */
const DEFAULT_PAST_QUOTE_LIMIT = 8;

// 받았던 견적 목록 조회 Query 스키마
// filter 유효성은 Service에서 INVALID_FILTER_TYPE으로 검증
export const pastQuotesQuerySchema = z.object({
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .default(DEFAULT_PAST_QUOTE_LIMIT),
  estimateRequestId: z.coerce.number().int().positive().optional(),
  filter: z.string().optional().default('ALL'),
});

export type PastQuotesQuery = z.infer<typeof pastQuotesQuerySchema>;
