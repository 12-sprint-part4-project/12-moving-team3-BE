import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { HistoryAction, Prisma, UserType } from '@prisma/client';
import * as auditContext from '../lib/audit-context';
import type { AdminReviewListRow } from '../repositories/admin-review.repository';
import * as adminReviewRepository from '../repositories/admin-review.repository';
import * as historyRepository from '../repositories/history.repository';
import type {
  AdminReviewDetailQuery,
  AdminReviewListQuery,
} from '../schemas/admin-review.schema';
import { createDateRange } from '../utils/admin-date-range.util';
import { AppError } from '../utils/app.error';
import {
  deleteAdminReview,
  getAdminReviewDetail,
  getAdminReviewList,
  getReviewStatistics,
} from './admin-review.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const MOVER_ID = '22222222-2222-4222-8222-222222222222';
const ADMIN_ID = 7;
const REVIEW_ID = 10;
const PREV_REVIEW_ID = 9;
const NEXT_REVIEW_ID = 11;
const FIXED_NOW = new Date('2026-08-26T12:00:00.000Z');
const CREATED_AT = new Date('2026-08-15T00:00:00.000Z');
const DELETED_AT = new Date('2026-08-20T00:00:00.000Z');
const AUG_01 = new Date('2026-08-01T00:00:00.000Z');
const AUG_26 = new Date('2026-08-26T00:00:00.000Z');

const defaultListQuery: AdminReviewListQuery = {
  page: 1,
  pageSize: 10,
  sort: 'DESC',
};

const defaultDetailQuery: AdminReviewDetailQuery = {
  sort: 'DESC',
};

const mockTx = { id: 'tx-1' };

const assertAppError =
  (code: string) =>
  (error: unknown): boolean => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, code);
    return true;
  };

const runManualAuditImmediately = async <T>(fn: () => Promise<T>) => fn();

const runTxImmediately = async <T>(
  fn: (tx: typeof mockTx) => Promise<T>
): Promise<T> => fn(mockTx);

const setupAuditTxMocks = () => {
  mock.method(auditContext, 'runWithManualAudit', runManualAuditImmediately);
  mock.method(auditContext, 'runAuditedTransaction', runTxImmediately);
};

const buildAuthor = (
  overrides: Partial<AdminReviewListRow['user']> = {}
): AdminReviewListRow['user'] => ({
  id: USER_ID,
  name: '작성자',
  nickname: 'author',
  email: 'author@example.com',
  userType: UserType.CUSTOMER,
  ...overrides,
});

const buildMover = (
  overrides: Partial<NonNullable<AdminReviewListRow['quote']['mover']>> = {}
): NonNullable<AdminReviewListRow['quote']['mover']> => ({
  id: MOVER_ID,
  name: '기사',
  nickname: 'mover',
  email: 'mover@example.com',
  userType: UserType.MOVER,
  ...overrides,
});

const buildListRow = (
  overrides: Partial<AdminReviewListRow> = {}
): AdminReviewListRow => ({
  id: REVIEW_ID,
  userId: USER_ID,
  quoteId: 100,
  rating: 5,
  content: '리뷰 내용',
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  deletedAt: null,
  user: buildAuthor(),
  quote: {
    mover: buildMover(),
  },
  ...overrides,
});

const mockNeighborResponses = (responses: Array<{ id: number } | null>) => {
  let responseIndex = 0;
  mock.method(adminReviewRepository, 'findAdminReviewFirst', async () => {
    const response = responses[responseIndex];
    responseIndex += 1;
    return response ?? null;
  });
};

describe('getReviewStatistics', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('날짜 없이 활성·삭제 리뷰 집계 조건을 각각 전달한다', async () => {
    const reviewCountWheres: Prisma.ReviewWhereInput[] = [];
    let averageWhere: Prisma.ReviewWhereInput | undefined;

    mock.method(
      adminReviewRepository,
      'getReviewCount',
      async (where: Prisma.ReviewWhereInput) => {
        reviewCountWheres.push(where);
        return reviewCountWheres.length === 1 ? 80 : 5;
      }
    );
    mock.method(
      adminReviewRepository,
      'getAverageReviewScore',
      async (where: Prisma.ReviewWhereInput) => {
        averageWhere = where;
        return 4.2;
      }
    );

    const result = await getReviewStatistics({});

    assert.deepEqual(result, {
      totalReviewCount: 80,
      averageReviewScore: 4.2,
      deletedReviewCount: 5,
    });
    assert.deepEqual(reviewCountWheres[0], { deletedAt: null });
    assert.deepEqual(averageWhere, { deletedAt: null });
    assert.deepEqual(reviewCountWheres[1], { deletedAt: { not: null } });
    assert.equal('createdAt' in reviewCountWheres[0], false);
  });

  it('startDate와 endDate가 있으면 세 집계 모두 같은 createdAt 범위를 사용한다', async () => {
    const receivedWheres: Prisma.ReviewWhereInput[] = [];

    mock.method(
      adminReviewRepository,
      'getReviewCount',
      async (where: Prisma.ReviewWhereInput) => {
        receivedWheres.push(where);
        return 1;
      }
    );
    mock.method(
      adminReviewRepository,
      'getAverageReviewScore',
      async (where: Prisma.ReviewWhereInput) => {
        receivedWheres.push(where);
        return 3.5;
      }
    );

    await getReviewStatistics({ startDate: AUG_01, endDate: AUG_26 });

    const dateRange = createDateRange(AUG_01, AUG_26);
    assert.equal(receivedWheres.length, 3);
    assert.deepEqual(receivedWheres[0], {
      createdAt: dateRange,
      deletedAt: null,
    });
    assert.deepEqual(receivedWheres[1], {
      createdAt: dateRange,
      deletedAt: null,
    });
    assert.deepEqual(receivedWheres[2], {
      createdAt: dateRange,
      deletedAt: { not: null },
    });
  });
});

describe('getAdminReviewList', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('전체 조회 조건의 totalCount와 페이지네이션을 같은 목록 결과로 반환한다', async () => {
    let receivedParams: AdminReviewListQuery | undefined;
    mock.method(
      adminReviewRepository,
      'findAdminReviewsWithCount',
      async (params: AdminReviewListQuery) => {
        receivedParams = params;
        return { items: [], totalCount: 21 };
      }
    );

    const params: AdminReviewListQuery = {
      page: 2,
      pageSize: 10,
      sort: 'DESC',
    };
    const result = await getAdminReviewList(params);

    assert.deepEqual(receivedParams, params);
    assert.deepEqual(result, {
      items: [],
      pagination: {
        page: 2,
        pageSize: 10,
        totalCount: 21,
        totalPages: 3,
      },
    });
  });

  it('totalCount가 0이면 totalPages도 0이다', async () => {
    mock.method(
      adminReviewRepository,
      'findAdminReviewsWithCount',
      async () => ({ items: [], totalCount: 0 })
    );

    const result = await getAdminReviewList(defaultListQuery);

    assert.deepEqual(result.items, []);
    assert.equal(result.pagination.totalPages, 0);
  });

  it('Repository row를 목록 DTO로 변환하고 기사 정보를 포함한다', async () => {
    mock.method(
      adminReviewRepository,
      'findAdminReviewsWithCount',
      async () => ({
        items: [buildListRow()],
        totalCount: 1,
      })
    );

    const result = await getAdminReviewList(defaultListQuery);
    const item = result.items[0];

    assert.equal(item?.id, REVIEW_ID);
    assert.equal(item?.userId, USER_ID);
    assert.equal(item?.quoteId, 100);
    assert.equal(item?.rating, 5);
    assert.equal(item?.content, '리뷰 내용');
    assert.equal(item?.createdAt.getTime(), CREATED_AT.getTime());
    assert.equal(item?.updatedAt?.getTime(), CREATED_AT.getTime());
    assert.equal(item?.deletedAt, null);
    assert.deepEqual(item?.author, {
      id: USER_ID,
      name: '작성자',
      nickname: 'author',
      email: 'author@example.com',
      userType: UserType.CUSTOMER,
    });
    assert.deepEqual(item?.mover, {
      id: MOVER_ID,
      name: '기사',
      nickname: 'mover',
      email: 'mover@example.com',
      userType: UserType.MOVER,
    });
  });

  it('quote.mover가 null이면 응답 mover도 null이다', async () => {
    mock.method(
      adminReviewRepository,
      'findAdminReviewsWithCount',
      async () => ({
        items: [
          buildListRow({
            quote: { mover: null },
          }),
        ],
        totalCount: 1,
      })
    );

    const result = await getAdminReviewList(defaultListQuery);

    assert.equal(result.items[0]?.mover, null);
  });

  it('활성 리뷰와 삭제 리뷰를 각각 정확히 매핑한다', async () => {
    mock.method(
      adminReviewRepository,
      'findAdminReviewsWithCount',
      async () => ({
        items: [
          buildListRow({ id: 1, deletedAt: null }),
          buildListRow({ id: 2, deletedAt: DELETED_AT }),
        ],
        totalCount: 2,
      })
    );

    const result = await getAdminReviewList(defaultListQuery);

    assert.equal(result.items[0]?.deletedAt, null);
    assert.equal(result.items[1]?.deletedAt?.getTime(), DELETED_AT.getTime());
  });
});

describe('getAdminReviewDetail', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('리뷰가 없으면 ADMIN_REVIEW_NOT_FOUND를 던진다', async () => {
    mock.method(adminReviewRepository, 'findAdminReviewById', async () => null);

    await assert.rejects(
      () => getAdminReviewDetail(99, defaultDetailQuery),
      assertAppError('ADMIN_REVIEW_NOT_FOUND')
    );
  });

  it('리뷰 상세 DTO와 삭제된 리뷰의 deletedAt을 반환한다', async () => {
    mock.method(
      adminReviewRepository,
      'findAdminReviewById',
      async (reviewId: number) => {
        assert.equal(reviewId, REVIEW_ID);
        return buildListRow({ deletedAt: DELETED_AT });
      }
    );
    mock.method(adminReviewRepository, 'findAdminReviewFirst', async () => ({
      id: REVIEW_ID,
    }));

    const result = await getAdminReviewDetail(REVIEW_ID, defaultDetailQuery);

    assert.equal(result.id, REVIEW_ID);
    assert.equal(result.deletedAt?.getTime(), DELETED_AT.getTime());
    assert.equal(result.author.id, USER_ID);
    assert.equal(result.mover?.id, MOVER_ID);
  });

  it('quote.mover가 null인 상세도 정상 변환한다', async () => {
    mock.method(adminReviewRepository, 'findAdminReviewById', async () =>
      buildListRow({ quote: { mover: null } })
    );
    mock.method(adminReviewRepository, 'findAdminReviewFirst', async () => ({
      id: REVIEW_ID,
    }));

    const result = await getAdminReviewDetail(REVIEW_ID, defaultDetailQuery);

    assert.equal(result.mover, null);
  });

  it('현재 리뷰가 목록 필터 밖이면 prevId와 nextId가 null이고 이전·다음 조회를 하지 않는다', async () => {
    let firstCallCount = 0;

    mock.method(adminReviewRepository, 'findAdminReviewById', async () =>
      buildListRow()
    );
    mock.method(adminReviewRepository, 'findAdminReviewFirst', async () => {
      firstCallCount += 1;
      return null;
    });

    const result = await getAdminReviewDetail(REVIEW_ID, defaultDetailQuery);

    assert.equal(result.prevId, null);
    assert.equal(result.nextId, null);
    assert.equal(firstCallCount, 1);
  });

  it('sort=DESC일 때 이전·다음 where와 정렬을 사용한다', async () => {
    const neighborCalls: Array<{
      where: Prisma.ReviewWhereInput;
      orderBy: Prisma.ReviewOrderByWithRelationInput[];
    }> = [];
    let callIndex = 0;

    mock.method(adminReviewRepository, 'findAdminReviewById', async () =>
      buildListRow()
    );
    mock.method(
      adminReviewRepository,
      'findAdminReviewFirst',
      async (
        where: Prisma.ReviewWhereInput,
        orderBy: Prisma.ReviewOrderByWithRelationInput[]
      ) => {
        callIndex += 1;
        if (callIndex === 1) {
          return { id: REVIEW_ID };
        }
        neighborCalls.push({ where, orderBy });
        return null;
      }
    );

    await getAdminReviewDetail(REVIEW_ID, defaultDetailQuery);

    assert.deepEqual(neighborCalls[0]?.orderBy, [
      { createdAt: 'asc' },
      { id: 'asc' },
    ]);
    assert.deepEqual(neighborCalls[1]?.orderBy, [
      { createdAt: 'desc' },
      { id: 'desc' },
    ]);
    assert.deepEqual(neighborCalls[0]?.where, {
      AND: [
        adminReviewRepository.buildAdminReviewListWhere(defaultDetailQuery),
        {
          OR: [
            { createdAt: { gt: CREATED_AT } },
            { createdAt: CREATED_AT, id: { gt: REVIEW_ID } },
          ],
        },
      ],
    });
    assert.deepEqual(neighborCalls[1]?.where, {
      AND: [
        adminReviewRepository.buildAdminReviewListWhere(defaultDetailQuery),
        {
          OR: [
            { createdAt: { lt: CREATED_AT } },
            { createdAt: CREATED_AT, id: { lt: REVIEW_ID } },
          ],
        },
      ],
    });
  });

  it('sort=ASC일 때 이전·다음 조회 조건과 정렬을 사용한다', async () => {
    const neighborCalls: Array<{
      where: Prisma.ReviewWhereInput;
      orderBy: Prisma.ReviewOrderByWithRelationInput[];
    }> = [];
    let callIndex = 0;

    mock.method(adminReviewRepository, 'findAdminReviewById', async () =>
      buildListRow()
    );
    mock.method(
      adminReviewRepository,
      'findAdminReviewFirst',
      async (
        where: Prisma.ReviewWhereInput,
        orderBy: Prisma.ReviewOrderByWithRelationInput[]
      ) => {
        callIndex += 1;
        if (callIndex === 1) {
          return { id: REVIEW_ID };
        }
        neighborCalls.push({ where, orderBy });
        return null;
      }
    );

    await getAdminReviewDetail(REVIEW_ID, { sort: 'ASC' });

    assert.deepEqual(neighborCalls[0]?.orderBy, [
      { createdAt: 'desc' },
      { id: 'asc' },
    ]);
    assert.deepEqual(neighborCalls[1]?.orderBy, [
      { createdAt: 'asc' },
      { id: 'desc' },
    ]);
    assert.deepEqual(neighborCalls[0]?.where, {
      AND: [
        adminReviewRepository.buildAdminReviewListWhere({}),
        {
          OR: [
            { createdAt: { lt: CREATED_AT } },
            { createdAt: CREATED_AT, id: { gt: REVIEW_ID } },
          ],
        },
      ],
    });
    assert.deepEqual(neighborCalls[1]?.where, {
      AND: [
        adminReviewRepository.buildAdminReviewListWhere({}),
        {
          OR: [
            { createdAt: { gt: CREATED_AT } },
            { createdAt: CREATED_AT, id: { lt: REVIEW_ID } },
          ],
        },
      ],
    });
  });

  it('createdAt이 같으면 id를 tie-breaker로 사용한다', async () => {
    const neighborCalls: Array<{
      where: Prisma.ReviewWhereInput;
      orderBy: Prisma.ReviewOrderByWithRelationInput[];
    }> = [];
    let callIndex = 0;

    mock.method(adminReviewRepository, 'findAdminReviewById', async () =>
      buildListRow()
    );
    mock.method(
      adminReviewRepository,
      'findAdminReviewFirst',
      async (
        where: Prisma.ReviewWhereInput,
        orderBy: Prisma.ReviewOrderByWithRelationInput[]
      ) => {
        callIndex += 1;
        if (callIndex === 1) {
          return { id: REVIEW_ID };
        }
        neighborCalls.push({ where, orderBy });
        return null;
      }
    );

    await getAdminReviewDetail(REVIEW_ID, defaultDetailQuery);

    const prevOr = (
      neighborCalls[0]?.where as { AND: Prisma.ReviewWhereInput[] }
    ).AND[1] as { OR: Prisma.ReviewWhereInput[] };
    assert.deepEqual(prevOr.OR[1], {
      createdAt: CREATED_AT,
      id: { gt: REVIEW_ID },
    });
    const nextOr = (
      neighborCalls[1]?.where as { AND: Prisma.ReviewWhereInput[] }
    ).AND[1] as { OR: Prisma.ReviewWhereInput[] };
    assert.deepEqual(nextOr.OR[1], {
      createdAt: CREATED_AT,
      id: { lt: REVIEW_ID },
    });
  });

  it('이전 리뷰만 있으면 prevId만 채운다', async () => {
    mock.method(adminReviewRepository, 'findAdminReviewById', async () =>
      buildListRow()
    );
    mockNeighborResponses([{ id: REVIEW_ID }, { id: PREV_REVIEW_ID }, null]);

    const result = await getAdminReviewDetail(REVIEW_ID, defaultDetailQuery);

    assert.equal(result.prevId, PREV_REVIEW_ID);
    assert.equal(result.nextId, null);
  });

  it('다음 리뷰만 있으면 nextId만 채운다', async () => {
    mock.method(adminReviewRepository, 'findAdminReviewById', async () =>
      buildListRow()
    );
    mockNeighborResponses([{ id: REVIEW_ID }, null, { id: NEXT_REVIEW_ID }]);

    const result = await getAdminReviewDetail(REVIEW_ID, defaultDetailQuery);

    assert.equal(result.prevId, null);
    assert.equal(result.nextId, NEXT_REVIEW_ID);
  });

  it('이전·다음 리뷰가 모두 있으면 prevId와 nextId를 모두 채운다', async () => {
    mock.method(adminReviewRepository, 'findAdminReviewById', async () =>
      buildListRow()
    );
    mockNeighborResponses([
      { id: REVIEW_ID },
      { id: PREV_REVIEW_ID },
      { id: NEXT_REVIEW_ID },
    ]);

    const result = await getAdminReviewDetail(REVIEW_ID, defaultDetailQuery);

    assert.equal(result.prevId, PREV_REVIEW_ID);
    assert.equal(result.nextId, NEXT_REVIEW_ID);
  });

  it('이전·다음 리뷰가 모두 없으면 prevId와 nextId가 null이다', async () => {
    mock.method(adminReviewRepository, 'findAdminReviewById', async () =>
      buildListRow()
    );
    mockNeighborResponses([{ id: REVIEW_ID }, null, null]);

    const result = await getAdminReviewDetail(REVIEW_ID, defaultDetailQuery);

    assert.equal(result.prevId, null);
    assert.equal(result.nextId, null);
  });
});

describe('deleteAdminReview', () => {
  beforeEach(() => {
    mock.timers.enable({ apis: ['Date'], now: FIXED_NOW });
  });

  afterEach(() => {
    mock.timers.reset();
    mock.restoreAll();
  });

  it('삭제 성공 시 soft delete와 reviews DELETE History를 같은 tx로 남긴다', async () => {
    let historyInput:
      Parameters<typeof historyRepository.createHistory>[0] | undefined;
    const txRefs: unknown[] = [];
    let auditRan = false;

    mock.method(
      auditContext,
      'runWithManualAudit',
      async (fn: () => Promise<void>) => {
        auditRan = true;
        return fn();
      }
    );
    mock.method(
      auditContext,
      'runAuditedTransaction',
      async (fn: (tx: typeof mockTx) => Promise<void>) => fn(mockTx)
    );
    mock.method(
      adminReviewRepository,
      'softDeleteAdminReview',
      async (reviewId: number, deletedAt: Date, tx: typeof mockTx) => {
        txRefs.push(tx);
        assert.equal(reviewId, REVIEW_ID);
        assert.equal(deletedAt.getTime(), FIXED_NOW.getTime());
        return { kind: 'deleted', id: REVIEW_ID, deletedAt: FIXED_NOW };
      }
    );
    mock.method(
      historyRepository,
      'createHistory',
      async (data: Prisma.HistoryUncheckedCreateInput, tx: typeof mockTx) => {
        txRefs.push(tx);
        historyInput = data;
        return { id: 1 };
      }
    );

    const result = await deleteAdminReview(REVIEW_ID, ADMIN_ID);

    assert.equal(result, undefined);
    assert.equal(auditRan, true);
    assert.equal(historyInput?.userId, null);
    assert.equal(historyInput?.adminUserId, ADMIN_ID);
    assert.equal(historyInput?.tableName, 'reviews');
    assert.equal(historyInput?.tableRowId, String(REVIEW_ID));
    assert.equal(historyInput?.operationType, HistoryAction.DELETE);
    assert.deepEqual(historyInput?.beforeData, {
      id: REVIEW_ID,
      deletedAt: null,
    });
    assert.deepEqual(historyInput?.afterData, {
      id: REVIEW_ID,
      deletedAt: FIXED_NOW.toISOString(),
    });
    assert.equal(
      txRefs.every((tx) => tx === mockTx),
      true
    );
  });

  it('이미 삭제된 리뷰면 ADMIN_REVIEW_ALREADY_DELETED를 던지고 History를 생성하지 않는다', async () => {
    let historyCalled = false;

    setupAuditTxMocks();
    mock.method(adminReviewRepository, 'softDeleteAdminReview', async () => ({
      kind: 'already_deleted',
      id: REVIEW_ID,
    }));
    mock.method(historyRepository, 'createHistory', async () => {
      historyCalled = true;
      return { id: 1 };
    });

    await assert.rejects(
      () => deleteAdminReview(REVIEW_ID, ADMIN_ID),
      assertAppError('ADMIN_REVIEW_ALREADY_DELETED')
    );
    assert.equal(historyCalled, false);
  });

  it('존재하지 않는 리뷰면 ADMIN_REVIEW_NOT_FOUND를 던지고 History를 생성하지 않는다', async () => {
    let historyCalled = false;

    setupAuditTxMocks();
    mock.method(adminReviewRepository, 'softDeleteAdminReview', async () => ({
      kind: 'not_found',
    }));
    mock.method(historyRepository, 'createHistory', async () => {
      historyCalled = true;
      return { id: 1 };
    });

    await assert.rejects(
      () => deleteAdminReview(REVIEW_ID, ADMIN_ID),
      assertAppError('ADMIN_REVIEW_NOT_FOUND')
    );
    assert.equal(historyCalled, false);
  });

  it('softDeleteAdminReview가 에러를 던지면 에러가 전파되고 History를 생성하지 않는다', async () => {
    let historyCalled = false;

    setupAuditTxMocks();
    mock.method(adminReviewRepository, 'softDeleteAdminReview', async () => {
      throw new Error('soft delete failed');
    });
    mock.method(historyRepository, 'createHistory', async () => {
      historyCalled = true;
      return { id: 1 };
    });

    await assert.rejects(
      () => deleteAdminReview(REVIEW_ID, ADMIN_ID),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, 'soft delete failed');
        return true;
      }
    );
    assert.equal(historyCalled, false);
  });

  it('createHistory가 실패하면 성공 결과를 반환하지 않고 에러가 전파된다', async () => {
    setupAuditTxMocks();
    mock.method(adminReviewRepository, 'softDeleteAdminReview', async () => ({
      kind: 'deleted',
      id: REVIEW_ID,
      deletedAt: FIXED_NOW,
    }));
    mock.method(historyRepository, 'createHistory', async () => {
      throw new Error('history failed');
    });

    await assert.rejects(
      () => deleteAdminReview(REVIEW_ID, ADMIN_ID),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, 'history failed');
        return true;
      }
    );
  });
});
