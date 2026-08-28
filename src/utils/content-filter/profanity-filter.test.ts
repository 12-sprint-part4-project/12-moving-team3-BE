import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { containsExactProfanity } from './profanity-filter';

describe('containsExactProfanity', () => {
  it('금칙어 원문을 탐지한다', () => {
    assert.equal(
      containsExactProfanity('씨발', [{ id: 1, word: '씨발', normalizedWord: '씨발' }]),
      true
    );
  });

  it('! 구분자 우회를 탐지한다', () => {
    assert.equal(
      containsExactProfanity('씨!발', [{ id: 1, word: '씨발', normalizedWord: '씨발' }]),
      true
    );
  });

  it('금칙어 없으면 false', () => {
    assert.equal(
      containsExactProfanity('안녕하세요', [
        { id: 1, word: '씨발', normalizedWord: '씨발' },
      ]),
      false
    );
  });
});
