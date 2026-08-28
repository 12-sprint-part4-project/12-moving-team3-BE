import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PROFANITY_FILTER_MESSAGE } from '../../constants/banned-words';
import {
  decideFilterAction,
  toMaskedContent,
  toUniqueReasons,
} from './decide-action.util';
import type { FilterHit } from './types';

describe('decideFilterAction', () => {
  it('hit 없으면 allow', () => {
    assert.equal(decideFilterAction([], '안녕'), 'allow');
  });

  it('욕설 hit면 block', () => {
    const hits: FilterHit[] = [
      { code: 'PROFANITY', method: 'exact' },
    ];
    assert.equal(decideFilterAction(hits, '욕설'), 'block');
  });

  it('normalized 전화 hit면 block', () => {
    const hits: FilterHit[] = [
      {
        code: 'PERSONAL_INFO_PHONE',
        method: 'normalized',
        range: { start: 0, end: 13 },
      },
    ];
    assert.equal(decideFilterAction(hits, '공일공 1234 5678'), 'block');
  });

  it('문장 안 전화는 mask', () => {
    const hits: FilterHit[] = [
      {
        code: 'PERSONAL_INFO_PHONE',
        method: 'regex',
        range: { start: 4, end: 17 },
      },
    ];
    assert.equal(
      decideFilterAction(hits, '연락처 010-1234-5678 입니다'),
      'mask'
    );
  });

  it('번호만 있는 메시지는 block', () => {
    const content = '010-1234-5678';
    const hits: FilterHit[] = [
      {
        code: 'PERSONAL_INFO_PHONE',
        method: 'regex',
        range: { start: 0, end: content.length },
      },
    ];
    assert.equal(decideFilterAction(hits, content), 'block');
  });
});

describe('toMaskedContent', () => {
  it('욕설 reason이 있으면 욕설 안내 문구를 반환한다', () => {
    const result = toMaskedContent(
      '원문',
      'block',
      [{ code: 'PROFANITY', method: 'exact' }],
      []
    );
    assert.equal(result, PROFANITY_FILTER_MESSAGE);
  });

  it('mask면 전화·계좌 토큰으로 치환한다', () => {
    const content = '010-1234-5678 / 123-4567-890123';
    const hits: FilterHit[] = [
      {
        code: 'PERSONAL_INFO_PHONE',
        method: 'regex',
        range: { start: 0, end: 13 },
      },
      {
        code: 'PERSONAL_INFO_ACCOUNT',
        method: 'regex',
        range: { start: 16, end: content.length },
      },
    ];
    const result = toMaskedContent(
      content,
      'mask',
      [
        { code: 'PERSONAL_INFO_PHONE', method: 'regex' },
        { code: 'PERSONAL_INFO_ACCOUNT', method: 'regex' },
      ],
      hits
    );
    assert.equal(result, '[전화번호] / [계좌번호]');
  });
});

describe('toUniqueReasons', () => {
  it('동일 reason은 dedupe한다', () => {
    const hits: FilterHit[] = [
      { code: 'PROFANITY', method: 'exact' },
      { code: 'PROFANITY', method: 'exact' },
    ];
    assert.deepEqual(toUniqueReasons(hits), [
      { code: 'PROFANITY', method: 'exact' },
    ]);
  });
});
