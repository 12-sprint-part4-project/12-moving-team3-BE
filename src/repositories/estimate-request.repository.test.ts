import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  EstimateRequestStatus,
  MoveType,
  Region,
  type Prisma,
} from '@prisma/client';
import { startOfDay } from '../utils/date.util';
import {
  buildEstimateRequestListWhere,
  updateEstimateRequestDraft,
  type EstimateRequestFilterParams,
  type CustomerEstimateRequestRow,
} from './estimate-request.repository';

interface FakeEstimateRequestDb {
  estimateRequest: {
    updateMany: (args: unknown) => Promise<{ count: number }>;
    findUnique: (args: unknown) => Promise<CustomerEstimateRequestRow | null>;
  };
}

const asDbClient = (fakeDb: FakeEstimateRequestDb): Prisma.TransactionClient =>
  fakeDb as unknown as Prisma.TransactionClient;

const NOW = new Date('2026-08-15T12:00:00.000Z');
const MOVER_ID = '11111111-1111-4111-8111-111111111111';

const baseParams: EstimateRequestFilterParams = {
  moverId: MOVER_ID,
  serviceRegions: [Region.SEOUL],
};

const getAndConditions = (
  where: Prisma.EstimateRequestWhereInput
): Prisma.EstimateRequestWhereInput[] => {
  assert.ok(Array.isArray(where.AND));
  return where.AND;
};

describe('buildEstimateRequestListWhere', () => {
  it('기본 조건으로 SUBMITTED·미확정·이사일·미응답 견적만 포함한다', () => {
    const and = getAndConditions(
      buildEstimateRequestListWhere(baseParams, NOW)
    );

    assert.equal(and.length, 1);
    assert.deepEqual(and[0], {
      status: EstimateRequestStatus.SUBMITTED,
      confirmedQuoteId: null,
      moveDate: { gte: startOfDay(NOW) },
      quotes: { none: { moverId: MOVER_ID, deletedAt: null } },
    });
  });

  it('keyword가 있으면 고객명·주소 조건을 추가한다', () => {
    const and = getAndConditions(
      buildEstimateRequestListWhere({ ...baseParams, keyword: '김고객' }, NOW)
    );

    assert.equal(and.length, 2);
    assert.ok(and[1].OR);
  });

  it('moveTypes가 있으면 moveType in 조건을 추가한다', () => {
    const and = getAndConditions(
      buildEstimateRequestListWhere(
        { ...baseParams, moveTypes: [MoveType.HOME, MoveType.SMALL] },
        NOW
      )
    );

    assert.deepEqual(and[1], {
      moveType: { in: [MoveType.HOME, MoveType.SMALL] },
    });
  });

  it('designated만 있으면 지정 기사 조건을 추가한다', () => {
    const and = getAndConditions(
      buildEstimateRequestListWhere({ ...baseParams, designated: true }, NOW)
    );

    assert.deepEqual(and[1], {
      designatedMovers: { some: { moverId: MOVER_ID } },
    });
  });

  it('serviceArea만 있으면 서비스 지역 주소 조건을 추가한다', () => {
    const and = getAndConditions(
      buildEstimateRequestListWhere({ ...baseParams, serviceArea: true }, NOW)
    );

    assert.equal(and.length, 2);
    assert.ok(and[1].OR);
  });

  it('designated와 serviceArea를 모두 켜면 OR로 결합한다', () => {
    const and = getAndConditions(
      buildEstimateRequestListWhere(
        { ...baseParams, designated: true, serviceArea: true },
        NOW
      )
    );

    assert.equal(and.length, 2);
    assert.ok(Array.isArray(and[1].OR));
    assert.deepEqual(and[1].OR?.[0], {
      designatedMovers: { some: { moverId: MOVER_ID } },
    });
  });

  it('서비스 지역이 비어 있으면 serviceArea 조건이 빈 id 집합이다', () => {
    const and = getAndConditions(
      buildEstimateRequestListWhere(
        {
          moverId: MOVER_ID,
          serviceRegions: [],
          serviceArea: true,
        },
        NOW
      )
    );

    assert.deepEqual(and[1], { id: { in: [] } });
  });
});

describe('updateEstimateRequestDraft', () => {
  it('갱신된 행이 없으면 재조회 없이 null을 반환한다', async () => {
    let findUniqueCalled = false;
    const fakeDb: FakeEstimateRequestDb = {
      estimateRequest: {
        updateMany: async () => ({ count: 0 }),
        findUnique: async () => {
          findUniqueCalled = true;
          return null;
        },
      },
    };

    const result = await updateEstimateRequestDraft(
      1,
      'user-1',
      { moveType: MoveType.HOME },
      asDbClient(fakeDb)
    );

    assert.equal(result, null);
    assert.equal(findUniqueCalled, false);
  });

  it('갱신된 행이 있으면 id·userId·DRAFT 조건으로 updateMany 후 최신 행을 재조회한다', async () => {
    const updatedRow = {
      id: 1,
      status: EstimateRequestStatus.DRAFT,
    } as unknown as CustomerEstimateRequestRow;
    let updateManyArgs: unknown;

    const fakeDb: FakeEstimateRequestDb = {
      estimateRequest: {
        updateMany: async (args) => {
          updateManyArgs = args;
          return { count: 1 };
        },
        findUnique: async () => updatedRow,
      },
    };

    const result = await updateEstimateRequestDraft(
      1,
      'user-1',
      { moveType: MoveType.HOME },
      asDbClient(fakeDb)
    );

    assert.deepEqual(updateManyArgs, {
      where: { id: 1, userId: 'user-1', status: EstimateRequestStatus.DRAFT },
      data: { moveType: MoveType.HOME },
    });
    assert.equal(result, updatedRow);
  });
});
