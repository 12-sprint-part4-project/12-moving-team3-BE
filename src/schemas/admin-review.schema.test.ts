import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { adminReviewListQuerySchema } from './admin-review.schema';

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
});
