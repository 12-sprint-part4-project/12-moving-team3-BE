import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { reportCreateBodySchema } from './report.schema';

describe('reportCreateBodySchema', () => {
  it('USER 대상은 UUID targetId를 허용한다', () => {
    const result = reportCreateBodySchema.parse({
      target: 'USER',
      targetId: '11111111-1111-4111-8111-111111111111',
      category: 'ABUSIVE_LANGUAGE',
    });

    assert.equal(result.target, 'USER');
    assert.equal(result.targetId, '11111111-1111-4111-8111-111111111111');
  });

  it('USER가 아닌 대상은 양의 정수 문자열 targetId를 허용한다', () => {
    const result = reportCreateBodySchema.parse({
      target: 'REVIEW',
      targetId: '12',
      category: 'INAPPROPRIATE_PROFILE',
    });

    assert.equal(result.targetId, '12');
  });

  it('USER targetId가 UUID가 아니면 검증에 실패한다', () => {
    const result = reportCreateBodySchema.safeParse({
      target: 'USER',
      targetId: '12',
      category: 'ABUSIVE_LANGUAGE',
    });

    assert.equal(result.success, false);
  });

  it('비USER targetId가 정수가 아니면 검증에 실패한다', () => {
    const result = reportCreateBodySchema.safeParse({
      target: 'REVIEW',
      targetId: 'abc',
      category: 'ABUSIVE_LANGUAGE',
    });

    assert.equal(result.success, false);
  });

  it('지원하지 않는 target·category면 검증에 실패한다', () => {
    assert.equal(
      reportCreateBodySchema.safeParse({
        target: 'CHAT_ROOM',
        targetId: '1',
        category: 'ABUSIVE_LANGUAGE',
      }).success,
      false
    );
    assert.equal(
      reportCreateBodySchema.safeParse({
        target: 'REVIEW',
        targetId: '1',
        category: 'SPAM',
      }).success,
      false
    );
  });

  it('Prisma Int 상한을 넘는 targetId면 검증에 실패한다', () => {
    const result = reportCreateBodySchema.safeParse({
      target: 'REVIEW',
      targetId: '2147483648',
      category: 'ABUSIVE_LANGUAGE',
    });

    assert.equal(result.success, false);
  });
});
