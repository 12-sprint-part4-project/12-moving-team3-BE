import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildMoverEmbeddingText } from './mover-embedding-text.util';

describe('buildMoverEmbeddingText', () => {
  it('name·shortDescription·description을 줄바꿈으로 합친다', () => {
    assert.equal(
      buildMoverEmbeddingText({
        name: '김이사',
        shortDescription: '친절한 이사',
        description: '서울·경기 전문',
      }),
      '김이사\n친절한 이사\n서울·경기 전문'
    );
  });

  it('null·undefined·공백 필드는 건너뛴다', () => {
    assert.equal(
      buildMoverEmbeddingText({
        name: '  박기사  ',
        shortDescription: null,
        description: '   ',
      }),
      '박기사'
    );

    assert.equal(
      buildMoverEmbeddingText({
        name: undefined,
        shortDescription: ' 짧은소개 ',
        description: undefined,
      }),
      '짧은소개'
    );
  });

  it('의미 있는 텍스트가 없으면 null을 반환한다', () => {
    assert.equal(
      buildMoverEmbeddingText({
        name: null,
        shortDescription: '  ',
        description: undefined,
      }),
      null
    );
  });
});
