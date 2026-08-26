import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  hasUniqueValues,
  moveTypeArraySchema,
  normalizeToArray,
  regionArraySchema,
} from './profile.schema';

describe('normalizeToArray', () => {
  it('배열은 그대로 둔다', () => {
    assert.deepEqual(normalizeToArray(['SMALL', 'HOME']), ['SMALL', 'HOME']);
  });

  it('콤마 문자열을 배열로 나눈다', () => {
    assert.deepEqual(normalizeToArray('SMALL, HOME'), ['SMALL', 'HOME']);
  });

  it('콤마 없는 문자열은 단일 원소 배열로 만든다', () => {
    assert.deepEqual(normalizeToArray('SEOUL'), ['SEOUL']);
  });
});

describe('hasUniqueValues', () => {
  it('중복이 없으면 true, 있으면 false를 반환한다', () => {
    assert.equal(hasUniqueValues(['SMALL', 'HOME']), true);
    assert.equal(hasUniqueValues(['SMALL', 'SMALL']), false);
  });
});

describe('moveTypeArraySchema', () => {
  it('콤마 문자열과 배열을 파싱한다', () => {
    assert.deepEqual(moveTypeArraySchema.parse('SMALL,HOME'), ['SMALL', 'HOME']);
    assert.deepEqual(moveTypeArraySchema.parse(['OFFICE']), ['OFFICE']);
  });

  it('빈 배열·중복·잘못된 값은 실패한다', () => {
    assert.equal(moveTypeArraySchema.safeParse([]).success, false);
    assert.equal(
      moveTypeArraySchema.safeParse(['SMALL', 'SMALL']).success,
      false
    );
    assert.equal(moveTypeArraySchema.safeParse(['UNKNOWN']).success, false);
  });
});

describe('regionArraySchema', () => {
  it('지역 배열을 파싱하고 중복은 거부한다', () => {
    assert.deepEqual(regionArraySchema.parse('SEOUL,BUSAN'), ['SEOUL', 'BUSAN']);
    assert.equal(
      regionArraySchema.safeParse(['SEOUL', 'SEOUL']).success,
      false
    );
  });
});
