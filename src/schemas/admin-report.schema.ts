import { UserReportStatus, UserReportTarget } from '@prisma/client';
import { z } from 'zod';
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
    // UserReport.target과 동일한 Prisma enum만 허용해 대상 유형 필터 의미를 스키마와 일치시킨다.
    target: z.enum(UserReportTarget).optional(),
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
