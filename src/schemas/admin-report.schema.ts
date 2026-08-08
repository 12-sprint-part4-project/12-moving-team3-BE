import { UserReportStatus } from '@prisma/client';
import { z } from 'zod';
import { SUPPORTED_REPORT_TARGETS } from '../constants/report-target';
import { listQuerySchema } from './admin-list-query.schema';

/**
 * 신고일 필터용 YYYY-MM-DD → UTC 자정 Date 변환.
 * adminStatisticsFilterSchema와 동일한 파싱을 써서 관리자 날짜 필터 의미를 통일한다.
 */
const reportedDateSchema = z.iso
  .date()
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

/** 관리자 신고 목록 조회 Query 스키마 */
export const adminReportListQuerySchema = listQuerySchema
  .pick({
    page: true,
    pageSize: true,
  })
  .extend({
    // UserReport.status와 동일한 Prisma enum만 허용해 잘못된 값이 DB까지 내려가지 않게 한다.
    status: z.enum(UserReportStatus).optional(),
    // Prisma enum 전체가 아니라 앱에서 지원하는 신고 대상만 필터로 받는다.
    target: z.enum(SUPPORTED_REPORT_TARGETS).optional(),
    // 공백만 있는 검색어는 의미가 없고, listQuerySchema.search와 같이 trim + min(1)로 맞춘다.
    // (실제 where 적용은 이후 커밋 — 여기서는 요청 계약만 고정한다.)
    targetUserKeyword: z.string().trim().min(1).optional(),
    // UserReport.createdAt 범위 필터. optional이라 기존 목록 호출과 호환된다.
    reportedFrom: reportedDateSchema.optional(),
    reportedTo: reportedDateSchema.optional(),
  })
  // end만 오면 시작이 모호해지므로 statistics와 같이 from 없는 to를 거부한다.
  .refine(({ reportedFrom, reportedTo }) => !(reportedTo && !reportedFrom))
  // from > to 는 빈 결과만 나므로 스키마에서 먼저 막아 잘못된 범위를 DB에 보내지 않는다.
  .refine(
    ({ reportedFrom, reportedTo }) =>
      !reportedFrom || !reportedTo || reportedFrom <= reportedTo
  );

export type AdminReportListQuery = z.infer<typeof adminReportListQuerySchema>;

/** 관리자 신고 상세 조회 Path Params — UserReport.id(Int)와 동일한 양의 정수만 허용 */
export const adminReportDetailParamsSchema = z.object({
  reportId: z.coerce.number().int().positive(),
});

export type AdminReportDetailParams = z.infer<
  typeof adminReportDetailParamsSchema
>;

/**
 * 신고 처리(resolve) 시 관리자가 선택할 수 있는 Action.
 * Prisma enum이 아니라 요청 계약 전용 — DB 컬럼과 1:1로 묶이지 않게 스키마에 둔다.
 */
export const ADMIN_REPORT_PROCESS_ACTIONS = [
  'SUSPEND_TARGET_USER',
  'DELETE_REPORTED_CONTENT',
] as const;

export const adminReportProcessActionSchema = z.enum(
  ADMIN_REPORT_PROCESS_ACTIONS
);

export type AdminReportProcessAction = z.infer<
  typeof adminReportProcessActionSchema
>;

/**
 * 신고 처리 요청 Body.
 * 반려(reject) Body에는 actions를 두지 않는다 — 반려는 조치 없이 상태만 바꾼다.
 */
export const adminReportProcessBodySchema = z.object({
  // 처리 API는 "무엇을 할지"가 핵심이라 actions를 필수로 둔다.
  // 정의되지 않은 필드는 Zod 기본 정책(strip)으로 제거하고 검증은 통과시킨다.
  actions: z
    .array(adminReportProcessActionSchema)
    // 빈 배열이면 처리/미처리가 모호해지므로 최소 1개를 요구한다.
    .min(1)
    // 같은 Action을 두 번 보내면 중복 실행·멱등성 이슈가 나기 쉬워 거부한다.
    .refine((actions) => new Set(actions).size === actions.length),
});

export type AdminReportProcessBody = z.infer<
  typeof adminReportProcessBodySchema
>;
