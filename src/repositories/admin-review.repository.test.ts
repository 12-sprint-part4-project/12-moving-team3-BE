import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Prisma } from '@prisma/client';
import { createDateRange } from '../utils/admin-date-range.util';
import {
  buildAdminReviewListWhere,
  softDeleteAdminReview,
} from './admin-review.repository';

const AUG_01 = new Date('2026-08-01T00:00:00.000Z');
const AUG_26 = new Date('2026-08-26T00:00:00.000Z');
const FIXED_NOW = new Date('2026-08-26T12:00:00.000Z');
const REVIEW_ID = 10;

type MockReviewDb = {
  review: {
    updateMany: (args: {
      where: { id: number; deletedAt: null };
      data: { deletedAt: Date };
    }) => Promise<{ count: number }>;
    findUnique: (args: {
      where: { id: number };
      select: { id: true; deletedAt: true };
    }) => Promise<{ id: number; deletedAt: Date | null } | null>;
  };
};

const createMockReviewDb = (
  handlers: Partial<{
    updateMany: MockReviewDb['review']['updateMany'];
    findUnique: MockReviewDb['review']['findUnique'];
  }>
): Prisma.TransactionClient =>
  ({
    review: {
      updateMany: handlers.updateMany,
      findUnique: handlers.findUnique,
    },
  }) as unknown as Prisma.TransactionClient;

describe('buildAdminReviewListWhere', () => {
  it('조건이 없으면 빈 where다', () => {
    const where = buildAdminReviewListWhere({});

    assert.deepEqual(where, {});
  });

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

  it('id=0은 undefined와 구분해 where.id에 반영한다', () => {
    const where = buildAdminReviewListWhere({ id: 0 });

    assert.equal(where.id, 0);
  });

  it('rating=0은 undefined와 구분해 where.rating에 반영한다', () => {
    const where = buildAdminReviewListWhere({ rating: 0 });

    assert.equal(where.rating, 0);
  });

  it('startDate와 endDate가 있으면 createdAt 범위를 적용한다', () => {
    const where = buildAdminReviewListWhere({
      startDate: AUG_01,
      endDate: AUG_26,
    });

    assert.deepEqual(where.createdAt, createDateRange(AUG_01, AUG_26));
  });

  it('userName은 작성자 이름·닉네임을 대소문자 구분 없이 검색한다', () => {
    const where = buildAdminReviewListWhere({ userName: '홍길동' });

    assert.deepEqual(where.user, {
      OR: [
        { name: { contains: '홍길동', mode: 'insensitive' } },
        { nickname: { contains: '홍길동', mode: 'insensitive' } },
      ],
    });
  });

  it('moverName은 기사 이름·닉네임을 대소문자 구분 없이 검색한다', () => {
    const where = buildAdminReviewListWhere({ moverName: '김기사' });

    assert.deepEqual(where.quote, {
      mover: {
        OR: [
          { name: { contains: '김기사', mode: 'insensitive' } },
          { nickname: { contains: '김기사', mode: 'insensitive' } },
        ],
      },
    });
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

  it('복합 필터를 한 번에 AND로 적용한다', () => {
    const where = buildAdminReviewListWhere({
      id: 5,
      rating: 4,
      deletionStatus: 'ACTIVE',
      userName: '홍길동',
      moverName: '김기사',
      startDate: AUG_01,
      endDate: AUG_26,
    });

    assert.deepEqual(where, {
      createdAt: createDateRange(AUG_01, AUG_26),
      id: 5,
      rating: 4,
      deletedAt: null,
      user: {
        OR: [
          { name: { contains: '홍길동', mode: 'insensitive' } },
          { nickname: { contains: '홍길동', mode: 'insensitive' } },
        ],
      },
      quote: {
        mover: {
          OR: [
            { name: { contains: '김기사', mode: 'insensitive' } },
            { nickname: { contains: '김기사', mode: 'insensitive' } },
          ],
        },
      },
    });
  });
});

describe('softDeleteAdminReview', () => {
  it('조건부 삭제 성공 시 deleted를 반환하고 findUnique를 호출하지 않는다', async () => {
    let findUniqueCalled = false;
    let updateArgs:
      | {
          where: { id: number; deletedAt: null };
          data: { deletedAt: Date };
        }
      | undefined;

    const db = createMockReviewDb({
      updateMany: async (args) => {
        updateArgs = args;
        return { count: 1 };
      },
      findUnique: async () => {
        findUniqueCalled = true;
        return null;
      },
    });

    const result = await softDeleteAdminReview(REVIEW_ID, FIXED_NOW, db);

    assert.deepEqual(result, {
      kind: 'deleted',
      id: REVIEW_ID,
      deletedAt: FIXED_NOW,
    });
    assert.deepEqual(updateArgs, {
      where: { id: REVIEW_ID, deletedAt: null },
      data: { deletedAt: FIXED_NOW },
    });
    assert.equal(findUniqueCalled, false);
  });

  it('updateMany가 0건이고 row가 이미 삭제됐으면 already_deleted를 반환한다', async () => {
    const db = createMockReviewDb({
      updateMany: async () => ({ count: 0 }),
      findUnique: async () => ({
        id: REVIEW_ID,
        deletedAt: FIXED_NOW,
      }),
    });

    const result = await softDeleteAdminReview(REVIEW_ID, FIXED_NOW, db);

    assert.deepEqual(result, {
      kind: 'already_deleted',
      id: REVIEW_ID,
    });
  });

  it('updateMany가 0건이고 row가 없으면 not_found를 반환한다', async () => {
    const db = createMockReviewDb({
      updateMany: async () => ({ count: 0 }),
      findUnique: async () => null,
    });

    const result = await softDeleteAdminReview(REVIEW_ID, FIXED_NOW, db);

    assert.deepEqual(result, { kind: 'not_found' });
  });
});
