/**
 * moveDate(@db.Date) 비교용 UTC 자정 기준일 산출
 */
export const startOfDay = (date: Date): Date =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );

/**
 * 이사일 경과 여부 판별
 * moveDate가 없으면 만료로 간주
 */
export const isMoveDateExpired = (
  moveDate: Date | null,
  now = new Date()
): boolean => {
  if (!moveDate) {
    return true;
  }

  return moveDate < startOfDay(now);
};
