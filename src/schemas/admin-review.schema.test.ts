import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  adminReviewDetailQuerySchema,
  adminReviewListQuerySchema,
  adminReviewParamsSchema,
} from './admin-review.schema';

describe('adminReviewListQuerySchema', () => {
  it('deletionStatus가 없으면 전체 조회를 위해 undefined로 유지한다', () => {
    const result = adminReviewListQuerySchema.parse({});

    assert.equal(result.deletionStatus, undefined);
  });

  it('sort가 없으면 DESC를 기본값으로 둔다', () => {
    const result = adminReviewListQuerySchema.parse({});

    assert.equal(result.sort, 'DESC');
  });

  it('sort ASC와 DESC를 그대로 보존한다', () => {
    assert.equal(adminReviewListQuerySchema.parse({ sort: 'ASC' }).sort, 'ASC');
    assert.equal(
      adminReviewListQuerySchema.parse({ sort: 'DESC' }).sort,
      'DESC'
    );
  });

  it('ACTIVE와 DELETED 필터 값을 그대로 보존한다', () => {
    assert.equal(
      adminReviewListQuerySchema.parse({ deletionStatus: 'ACTIVE' })
        .deletionStatus,
      'ACTIVE'
    );
    assert.equal(
      adminReviewListQuerySchema.parse({ deletionStatus: 'DELETED' })
        .deletionStatus,
      'DELETED'
    );
  });

  it('id를 숫자로 변환하고 userName·moverName을 trim한다', () => {
    const result = adminReviewListQuerySchema.parse({
      id: '12',
      userName: '  홍길동  ',
      moverName: '  김기사  ',
    });

    assert.equal(result.id, 12);
    assert.equal(result.userName, '홍길동');
    assert.equal(result.moverName, '김기사');
  });

  it('userName이 공백만 있으면 검증에 실패한다', () => {
    const result = adminReviewListQuerySchema.safeParse({ userName: '   ' });

    assert.equal(result.success, false);
  });

  it('moverName이 공백만 있으면 검증에 실패한다', () => {
    const result = adminReviewListQuerySchema.safeParse({ moverName: '   ' });

    assert.equal(result.success, false);
  });

  it('rating은 1~5 정수만 허용한다', () => {
    assert.equal(adminReviewListQuerySchema.parse({ rating: '3' }).rating, 3);
    assert.equal(
      adminReviewListQuerySchema.safeParse({ rating: 0 }).success,
      false
    );
    assert.equal(
      adminReviewListQuerySchema.safeParse({ rating: 6 }).success,
      false
    );
    assert.equal(
      adminReviewListQuerySchema.safeParse({ rating: '3.5' }).success,
      false
    );
  });

  it('page와 pageSize 경계값을 검증한다', () => {
    assert.equal(adminReviewListQuerySchema.parse({ page: '1' }).page, 1);
    assert.equal(
      adminReviewListQuerySchema.parse({ pageSize: '50' }).pageSize,
      50
    );
    assert.equal(
      adminReviewListQuerySchema.safeParse({ page: 0 }).success,
      false
    );
    assert.equal(
      adminReviewListQuerySchema.safeParse({ pageSize: 51 }).success,
      false
    );
  });

  it('deletionStatus 잘못된 값은 거부한다', () => {
    const result = adminReviewListQuerySchema.safeParse({
      deletionStatus: 'INVALID',
    });

    assert.equal(result.success, false);
  });

  it('startDate 없이 endDate만 전달하면 검증에 실패한다', () => {
    const result = adminReviewListQuerySchema.safeParse({
      endDate: '2026-08-31',
    });

    assert.equal(result.success, false);
  });
});

describe('adminReviewDetailQuerySchema', () => {
  it('page/pageSize 없이 파싱하고 sort 기본값은 DESC다', () => {
    const result = adminReviewDetailQuerySchema.parse({});

    assert.equal(result.sort, 'DESC');
    assert.equal('page' in result, false);
    assert.equal('pageSize' in result, false);
  });

  it('endDate만 있으면 검증에 실패한다', () => {
    const result = adminReviewDetailQuerySchema.safeParse({
      endDate: '2026-08-31',
    });

    assert.equal(result.success, false);
  });
});

describe('adminReviewParamsSchema', () => {
  it('reviewId 문자열을 숫자로 변환한다', () => {
    const result = adminReviewParamsSchema.parse({ reviewId: '12' });

    assert.equal(result.reviewId, 12);
  });

  it('reviewId가 0이거나 음수이면 검증에 실패한다', () => {
    assert.equal(
      adminReviewParamsSchema.safeParse({ reviewId: 0 }).success,
      false
    );
    assert.equal(
      adminReviewParamsSchema.safeParse({ reviewId: -1 }).success,
      false
    );
  });
});
