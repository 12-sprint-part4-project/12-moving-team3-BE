const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * YYYY-MM-DD로 전달된 날짜를
 * KST 기준 하루의 시작 시각(UTC)으로 변환한다.
 */
const toKstStartOfDay = (date: Date): Date => {
  const utcDateStart = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  );

  return new Date(utcDateStart - KST_OFFSET_MS);
};

export const createDateRange = (startDate?: Date, endDate?: Date) => {
  if (!startDate) {
    return undefined;
  }

  const start = toKstStartOfDay(startDate);
  const endExclusive = new Date(
    toKstStartOfDay(endDate ?? startDate).getTime() + DAY_MS
  );

  return {
    gte: start,
    lt: endExclusive,
  };
};
