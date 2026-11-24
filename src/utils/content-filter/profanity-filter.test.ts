import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  collectSimilarityCandidates,
  containsExactProfanity,
  findSimilarityProfanity,
} from './profanity-filter';

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

describe('collectSimilarityCandidates', () => {
  it('자모로만 된 토큰(ㅋㅋ·ㅎㅎ·ㅠㅠ)은 유사도 후보에서 제외한다', () => {
    assert.deepEqual(
      collectSimilarityCandidates('ㅋㅋ 진짜 감사합니다 ㅎㅎ ㅠㅠ'),
      ['진짜', '감사합니다']
    );
  });

  it('자모만 있는 메시지는 후보가 없다', () => {
    assert.deepEqual(collectSimilarityCandidates('ㅋㅋㅋㅋ ㅎㅎ'), []);
  });

  it('완성형 한글 사이에 붙은 자모는 후보에 섞이지 않는다', () => {
    assert.deepEqual(collectSimilarityCandidates('네ㅋㅋ 내일뵙겠습니다'), [
      '내일뵙겠습니다',
    ]);
  });
});

describe('findSimilarityProfanity', () => {
  it('자모만 있는 메시지는 임베딩을 호출하지 않고 통과한다', async () => {
    let embedCalled = false;

    const result = await findSimilarityProfanity(
      'ㅋㅋㅋ ㅎㅎ',
      {
        hasEmbeddingApiKey: true,
        embed: async () => {
          embedCalled = true;
          return [];
        },
        searchSimilarBannedWords: async () => [],
      },
      0.55
    );

    assert.equal(result, null);
    assert.equal(embedCalled, false);
  });
});
