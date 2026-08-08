/**
 * 애플리케이션이 지원하는 신고 대상.
 * Prisma UserReportTarget과 동일한 5종 — 요청 검증·Service 분기에서 재사용한다.
 */
export const SUPPORTED_REPORT_TARGETS = [
  'USER',
  'REVIEW',
  'MESSAGE',
  'ARTICLE',
  'COMMENT',
] as const;

export type SupportedReportTarget = (typeof SUPPORTED_REPORT_TARGETS)[number];

export const isSupportedReportTarget = (
  target: string
): target is SupportedReportTarget =>
  (SUPPORTED_REPORT_TARGETS as readonly string[]).includes(target);
