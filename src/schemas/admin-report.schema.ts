import { UserReportStatus, UserReportTarget } from '@prisma/client';
import { z } from 'zod';

/** 관리자 신고 목록 조회 Query 스키마 — 이번 단계는 status/target 필터만 담당한다 */
export const adminReportListQuerySchema = z.object({
  // UserReport.status와 동일한 Prisma enum만 허용해 잘못된 값이 DB까지 내려가지 않게 한다.
  status: z.enum(UserReportStatus).optional(),
  // UserReport.target과 동일한 Prisma enum만 허용해 대상 유형 필터 의미를 스키마와 일치시킨다.
  target: z.enum(UserReportTarget).optional(),
});

export type AdminReportListQuery = z.infer<typeof adminReportListQuerySchema>;
