import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toVectorLiteral } from './vector.util';

describe('toVectorLiteral', () => {
  it('숫자 배열을 pgvector 리터럴 문자열로 만든다', () => {
    assert.equal(toVectorLiteral([0.1, -0.2, 3]), '[0.1,-0.2,3]');
  });

  it('빈 배열이면 Invalid embedding vector를 던진다', () => {
    assert.throws(
      () => toVectorLiteral([]),
      (error: unknown) =>
        error instanceof Error && error.message === 'Invalid embedding vector'
    );
  });

  it('NaN·Infinity가 있으면 Invalid embedding vector를 던진다', () => {
    assert.throws(
      () => toVectorLiteral([1, Number.NaN]),
      (error: unknown) =>
        error instanceof Error && error.message === 'Invalid embedding vector'
    );

    assert.throws(
      () => toVectorLiteral([1, Number.POSITIVE_INFINITY]),
      (error: unknown) =>
        error instanceof Error && error.message === 'Invalid embedding vector'
    );
  });
});
