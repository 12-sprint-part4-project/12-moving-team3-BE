/**
 * 애플리케이션이 지원하는 신고 대상.
 * Prisma UserReportTarget과 분리해, enum에 남아 있어도 앱에서는 이 5종만 다룬다.
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
