import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { adminReviewListQuerySchema } from './admin-review.schema';

describe('adminReviewListQuerySchema', () => {
  it('deletionStatus가 없으면 전체 조회를 위해 undefined로 유지한다', () => {
    const result = adminReviewListQuerySchema.parse({});

    assert.equal(result.deletionStatus, undefined);
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
