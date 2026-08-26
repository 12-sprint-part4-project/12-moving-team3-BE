import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { countQuotesByDesignation } from './quote-count.util';

describe('countQuotesByDesignation', () => {
  it('지정·일반 견적 건수를 집계한다', () => {
    assert.deepEqual(
      countQuotesByDesignation([
        { isDesignated: true },
        { isDesignated: false },
        { isDesignated: true },
        { isDesignated: false },
        { isDesignated: false },
      ]),
      { designated: 2, general: 3 }
    );
  });

  it('빈 배열이면 0·0을 반환한다', () => {
    assert.deepEqual(countQuotesByDesignation([]), {
      designated: 0,
      general: 0,
    });
  });

  it('전부 지정이면 designated만 증가한다', () => {
    assert.deepEqual(
      countQuotesByDesignation([
        { isDesignated: true },
        { isDesignated: true },
      ]),
      { designated: 2, general: 0 }
    );
  });
});
