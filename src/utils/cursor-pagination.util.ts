/** 커서 기반 페이지네이션 meta (messageId / id 공통). */
export interface CursorPaginationMeta {
  hasNext: boolean;
  nextCursor: number | null;
}

/** hasNext와 가장 오래된 항목 ID로 nextCursor meta를 만든다. */
export const buildCursorPaginationMeta = (
  hasNext: boolean,
  oldestItemId: number | null | undefined
): CursorPaginationMeta => ({
  hasNext,
  nextCursor: hasNext && oldestItemId != null ? oldestItemId : null,
});
