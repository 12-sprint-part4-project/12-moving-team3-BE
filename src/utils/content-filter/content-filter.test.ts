import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isMobilePhoneDigits,
  normalizeSpanToDigits,
} from './digit-normalize.util';
import { collectPersonalInfoHits } from './personal-info-filter';

describe('normalizeSpanToDigits', () => {
  it('전각·한글 숫자·구분자를 ASCII digits로 정규화한다', () => {
    assert.deepEqual(normalizeSpanToDigits('０１０-1234-5678'), {
      digits: '01012345678',
      hasKoreanDigits: false,
      hasFullwidthDigits: true,
    });
    assert.deepEqual(normalizeSpanToDigits('０１０－１２３４－５６７８'), {
      digits: '01012345678',
      hasKoreanDigits: false,
      hasFullwidthDigits: true,
    });
    assert.deepEqual(normalizeSpanToDigits('공일공 1234 5678'), {
      digits: '01012345678',
      hasKoreanDigits: true,
      hasFullwidthDigits: false,
    });
  });
});

describe('isMobilePhoneDigits', () => {
  it('01033334444를 휴대폰으로 인식한다', () => {
    assert.equal(isMobilePhoneDigits('01033334444'), true);
  });
});

describe('collectPersonalInfoHits', () => {
  it('문장 안 하이픈 전화는 PHONE regex hit', () => {
    const hits = collectPersonalInfoHits({
      text: '연락처 010-1234-5678 입니다',
      maskPhone: true,
      maskAccount: true,
    });

    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.code, 'PERSONAL_INFO_PHONE');
    assert.equal(hits[0]?.method, 'regex');
  });

  it('01033334444는 PHONE만 잡고 ACCOUNT는 잡지 않는다', () => {
    const hits = collectPersonalInfoHits({
      text: '01033334444',
      maskPhone: true,
      maskAccount: true,
    });

    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.code, 'PERSONAL_INFO_PHONE');
  });

  it('한글 숫자 우회 전화는 normalized method', () => {
    const hits = collectPersonalInfoHits({
      text: '공일공 1234 5678',
      maskPhone: true,
      maskAccount: true,
    });

    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.code, 'PERSONAL_INFO_PHONE');
    assert.equal(hits[0]?.method, 'normalized');
  });

  it('카드 4-4-4-4 형식은 필터하지 않는다', () => {
    const hits = collectPersonalInfoHits({
      text: '4532-1234-5678-9010',
      maskPhone: true,
      maskAccount: true,
    });

    assert.equal(hits.length, 0);
  });

  it('전각 하이픈(－) 전화번호를 탐지한다', () => {
    const hits = collectPersonalInfoHits({
      text: '０１０－１２３４－５６７８',
      maskPhone: true,
      maskAccount: true,
    });

    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.code, 'PERSONAL_INFO_PHONE');
  });
});
