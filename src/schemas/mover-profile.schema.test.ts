import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  moverBasicInfoBodySchema,
  moverProfileBodySchema,
} from './mover-profile.schema';

const validProfileBody = {
  nickname: '김기사',
  career: '5',
  shortDescription: '안전 이사',
  description: '경력을 바탕으로 이사합니다.',
  service: ['HOME'],
  serviceRegions: ['SEOUL', 'GYEONGGI'],
};

describe('moverProfileBodySchema', () => {
  it('career를 정수로 변환하고 프로필 body를 파싱한다', () => {
    const result = moverProfileBodySchema.parse(validProfileBody);

    assert.equal(result.career, 5);
    assert.equal(result.nickname, '김기사');
    assert.deepEqual(result.serviceRegions, ['SEOUL', 'GYEONGGI']);
  });

  it('짧은 소개가 20자를 넘으면 실패한다', () => {
    const result = moverProfileBodySchema.safeParse({
      ...validProfileBody,
      shortDescription: '가'.repeat(21),
    });

    assert.equal(result.success, false);
  });

  it('상세 소개가 8자 미만이면 실패한다', () => {
    const result = moverProfileBodySchema.safeParse({
      ...validProfileBody,
      description: '짧음',
    });

    assert.equal(result.success, false);
  });

  it('s3Key 생략·null은 허용한다', () => {
    assert.equal(
      moverProfileBodySchema.safeParse(validProfileBody).success,
      true
    );
    assert.equal(
      moverProfileBodySchema.safeParse({ ...validProfileBody, s3Key: null })
        .success,
      true
    );
  });
});

describe('moverBasicInfoBodySchema', () => {
  it('이름과 전화번호를 파싱한다', () => {
    const result = moverBasicInfoBodySchema.parse({
      name: '  김기사  ',
      phoneNumber: '01011112222',
    });

    assert.equal(result.name, '김기사');
    assert.equal(result.phoneNumber, '01011112222');
  });

  it('전화번호 형식이 아니면 실패한다', () => {
    const result = moverBasicInfoBodySchema.safeParse({
      name: '김기사',
      phoneNumber: '010-1111-2222',
    });

    assert.equal(result.success, false);
  });
});
