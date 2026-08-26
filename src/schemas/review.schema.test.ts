import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  reviewBodySchema,
  reviewIdParamsSchema,
  reviewListQuerySchema,
  reviewWritableQuerySchema,
} from './review.schema';

describe('reviewBodySchema', () => {
  it('유효한 rating·content면 통과한다', () => {
    const result = reviewBodySchema.parse({
      rating: 5,
      content: '만족스러운 이사였습니다',
    });

    assert.equal(result.rating, 5);
    assert.equal(result.content, '만족스러운 이사였습니다');
  });

  it('content를 trim한다', () => {
    const result = reviewBodySchema.parse({
      rating: 4,
      content: '  열 글자 이상 후기입니다  ',
    });

    assert.equal(result.content, '열 글자 이상 후기입니다');
  });

  it('rating이 1 미만이거나 5 초과면 검증에 실패한다', () => {
    assert.equal(
      reviewBodySchema.safeParse({ rating: 0, content: '열 글자 이상 후기입니다' })
        .success,
      false
    );
    assert.equal(
      reviewBodySchema.safeParse({ rating: 6, content: '열 글자 이상 후기입니다' })
        .success,
      false
    );
  });

  it('content가 최소 길이 미만이면 검증에 실패한다', () => {
    const result = reviewBodySchema.safeParse({
      rating: 3,
      content: '짧음',
    });

    assert.equal(result.success, false);
  });

  it('content가 최대 길이를 넘으면 검증에 실패한다', () => {
    const result = reviewBodySchema.safeParse({
      rating: 5,
      content: '가'.repeat(601),
    });

    assert.equal(result.success, false);
  });
});

describe('reviewIdParamsSchema', () => {
  it('문자열 reviewId를 양의 정수로 변환한다', () => {
    assert.equal(reviewIdParamsSchema.parse({ reviewId: '12' }).reviewId, 12);
  });

  it('0 이하면 검증에 실패한다', () => {
    assert.equal(
      reviewIdParamsSchema.safeParse({ reviewId: '0' }).success,
      false
    );
  });
});

describe('reviewListQuerySchema', () => {
  it('page·limit 기본값은 1과 6이다', () => {
    const result = reviewListQuerySchema.parse({});

    assert.equal(result.page, 1);
    assert.equal(result.limit, 6);
  });

  it('limit가 6을 초과하면 검증에 실패한다', () => {
    assert.equal(
      reviewListQuerySchema.safeParse({ limit: '7' }).success,
      false
    );
  });
});

describe('reviewWritableQuerySchema', () => {
  it('page·limit 기본값은 목록 쿼리와 동일하다', () => {
    const result = reviewWritableQuerySchema.parse({});

    assert.equal(result.page, 1);
    assert.equal(result.limit, 6);
  });
});
