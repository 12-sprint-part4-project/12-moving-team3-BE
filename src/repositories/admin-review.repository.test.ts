import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildAdminReviewListWhere } from './admin-review.repository';

describe('buildAdminReviewListWhere', () => {
  it('deletionStatus 미전달 시 deletedAt 조건 없이 활성·삭제 리뷰를 함께 조회한다', () => {
    const where = buildAdminReviewListWhere({});

    assert.equal('deletedAt' in where, false);
  });

  it('ACTIVE면 미삭제 리뷰만 조회한다', () => {
    const where = buildAdminReviewListWhere({ deletionStatus: 'ACTIVE' });

    assert.deepEqual(where, { deletedAt: null });
  });

  it('DELETED면 삭제된 리뷰만 조회한다', () => {
    const where = buildAdminReviewListWhere({ deletionStatus: 'DELETED' });

    assert.deepEqual(where, { deletedAt: { not: null } });
  });

  it('userName과 moverName을 작성자·기사 조건으로 AND 결합한다', () => {
    const where = buildAdminReviewListWhere({
      id: 12,
      userName: '홍길동',
      moverName: '김기사',
    });

    assert.equal(where.id, 12);
    assert.deepEqual(where.user, {
      OR: [
        { name: { contains: '홍길동', mode: 'insensitive' } },
        { nickname: { contains: '홍길동', mode: 'insensitive' } },
      ],
    });
    assert.deepEqual(where.quote, {
      mover: {
        OR: [
          { name: { contains: '김기사', mode: 'insensitive' } },
          { nickname: { contains: '김기사', mode: 'insensitive' } },
        ],
      },
    });
  });
});
