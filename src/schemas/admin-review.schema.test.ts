import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  adminReviewDetailQuerySchema,
  adminReviewListQuerySchema,
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
});

describe('adminReviewDetailQuerySchema', () => {
  it('page/pageSize 없이 파싱하고 sort 기본값은 DESC다', () => {
    const result = adminReviewDetailQuerySchema.parse({});

    assert.equal(result.sort, 'DESC');
    assert.equal('page' in result, false);
  });

  it('endDate만 있으면 검증에 실패한다', () => {
    const result = adminReviewDetailQuerySchema.safeParse({
      endDate: '2026-08-31',
    });

    assert.equal(result.success, false);
  });
});
