/** 지정/일반 견적 건수 */
export interface QuoteCount {
  designated: number;
  general: number;
}

/**
 * 견적 목록을 지정/일반 건수로 집계
 * — isDesignated 필드만 사용 (입력 계약 유지)
 */
export const countQuotesByDesignation = (
  quotes: Array<{ isDesignated: boolean }>
): QuoteCount =>
  quotes.reduce(
    (acc, quote) => {
      if (quote.isDesignated) {
        acc.designated += 1;
      } else {
        acc.general += 1;
      }
      return acc;
    },
    { designated: 0, general: 0 }
  );
