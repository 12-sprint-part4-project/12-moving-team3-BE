/**
 * 값이 null/undefined인 키만 모아 누락 필드명 배열로 반환한다.
 * 관리자 조회에서 상태 불변식 위반을 응답에 드러낼 때 사용한다.
 */
export const collectMissingFields = (
  checks: Record<string, unknown>
): string[] =>
  Object.entries(checks)
    .filter(([, value]) => value == null)
    .map(([key]) => key);
