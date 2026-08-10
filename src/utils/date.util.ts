/**
 * moveDate(@db.Date) 비교용 UTC 자정 기준일 산출
 */
export const startOfDay = (date: Date): Date =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );

/**
 * Asia/Seoul 달력 기준 YYYY-MM-DD
 */
export const toDateStringKst = (date: Date): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  return `${year}-${month}-${day}`;
};

/**
 * Asia/Seoul 달력일 기준 UTC 자정 Date (@db.Date 비교용)
 */
export const startOfDayKst = (date: Date = new Date()): Date => {
  const [year, month, day] = toDateStringKst(date).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

/**
 * Asia/Seoul 기준 현재 시각이 지정 hour(0–23) 이상인지.
 * 이사 전날 리마인더 부팅 catch-up(09:00 이후만) 등에 사용.
 */
export const isAtOrAfterHourKst = (
  hour: number,
  now: Date = new Date()
): boolean => {
  const hourPart = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(now)
    .find((part) => part.type === 'hour')?.value;

  return Number(hourPart ?? '0') >= hour;
};

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
