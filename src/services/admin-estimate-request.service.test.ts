import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { EstimateRequestStatus, QuoteStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import * as estimateRequestRepository from '../repositories/admin-estimate-request.repository';
import type { AdminEstimateRequestListQuery } from '../schemas/admin-estimate-request.schema';
import { AppError } from '../utils/app.error';
import * as dateSortUtil from '../utils/admin-date-sort.util';
import {
  createEstimateRequestCommonWhere,
  getEstimateRequestDetail,
  getEstimateRequestList,
  getEstimateRequestStatistics,
} from './admin-estimate-request.service';

const START_DATE = new Date('2026-08-01T00:00:00.000Z');
const END_DATE = new Date('2026-08-26T00:00:00.000Z');
const RANGE_LT = new Date('2026-08-27T00:00:00.000Z');
const SUBMITTED_AT = new Date('2026-08-15T00:00:00.000Z');

const defaultListQuery: AdminEstimateRequestListQuery = {
  page: 1,
  pageSize: 10,
  sort: 'DESC',
};

const assertNotFound = (error: unknown): boolean => {
  assert.ok(error instanceof AppError);
  assert.equal(error.code, 'ADMIN_ESTIMATE_REQUEST_NOT_FOUND');
  return true;
};

describe('createEstimateRequestCommonWhere', () => {
  it('전화번호에서 숫자가 아닌 문자를 제거하고 contains로 찾는다', () => {
    assert.deepEqual(
      createEstimateRequestCommonWhere({ phoneNumber: '010-1234-5678' }),
      {
        user: {
          phoneNumber: {
            contains: '01012345678',
          },
        },
      }
    );
  });

  it('userName은 name contains로 찾는다', () => {
    assert.deepEqual(createEstimateRequestCommonWhere({ userName: '홍길동' }), {
      user: {
        name: {
          contains: '홍길동',
        },
      },
    });
  });

  it('이름과 전화번호가 없으면 user 조건을 두지 않는다', () => {
    assert.deepEqual(createEstimateRequestCommonWhere({ id: 12 }), { id: 12 });
    assert.deepEqual(createEstimateRequestCommonWhere({}), {});
  });
});

describe('getEstimateRequestStatistics', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('레포가 준 completed는 응답에서 빼고 나머지 상태만 반환한다', async () => {
    mock.method(
      estimateRequestRepository,
      'getEstimateRequestStatusStatistics',
      async () => ({
        submitted: 1,
        confirmed: 2,
        completed: 9,
        expired: 3,
        canceled: 4,
      })
    );

    const result = await getEstimateRequestStatistics({});

    assert.deepEqual(result, {
      submitted: 1,
      confirmed: 2,
      expired: 3,
      canceled: 4,
    });
  });
});

describe('getEstimateRequestList', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('status가 없으면 DRAFT와 COMPLETED를 제외한다', async () => {
    let receivedWhere: Prisma.EstimateRequestWhereInput | undefined;
    mock.method(
      estimateRequestRepository,
      'findEstimateRequestList',
      async (where: Prisma.EstimateRequestWhereInput) => {
        receivedWhere = where;
        return [];
      }
    );
    mock.method(
      estimateRequestRepository,
      'getEstimateRequestCount',
      async () => 0
    );

    await getEstimateRequestList(defaultListQuery);

    assert.deepEqual(receivedWhere?.status, {
      not: {
        in: [EstimateRequestStatus.DRAFT, EstimateRequestStatus.COMPLETED],
      },
    });
  });

  it('status가 있으면 해당 상태만 조회한다', async () => {
    let receivedWhere: Prisma.EstimateRequestWhereInput | undefined;
    mock.method(
      estimateRequestRepository,
      'findEstimateRequestList',
      async (where: Prisma.EstimateRequestWhereInput) => {
        receivedWhere = where;
        return [];
      }
    );
    mock.method(
      estimateRequestRepository,
      'getEstimateRequestCount',
      async () => 0
    );

    await getEstimateRequestList({
      ...defaultListQuery,
      status: EstimateRequestStatus.SUBMITTED,
    });

    assert.equal(receivedWhere?.status, EstimateRequestStatus.SUBMITTED);
  });

  it('기간 필터는 submittedAt에 gte/lt로 붙인다', async () => {
    let receivedWhere: Prisma.EstimateRequestWhereInput | undefined;
    mock.method(
      estimateRequestRepository,
      'findEstimateRequestList',
      async (where: Prisma.EstimateRequestWhereInput) => {
        receivedWhere = where;
        return [];
      }
    );
    mock.method(
      estimateRequestRepository,
      'getEstimateRequestCount',
      async () => 0
    );

    await getEstimateRequestList({
      ...defaultListQuery,
      startDate: START_DATE,
      endDate: END_DATE,
    });

    assert.deepEqual(receivedWhere?.submittedAt, {
      gte: START_DATE,
      lt: RANGE_LT,
    });
  });

  it('필수값이 null이면 missingFields에 담고 500을 내지 않는다', async () => {
    mock.method(
      estimateRequestRepository,
      'findEstimateRequestList',
      async () => [
        {
          id: 1,
          user: { name: '홍길동', phoneNumber: '01012345678' },
          moveType: null,
          departureAddress: null,
          arrivalAddress: '서울시 강남구',
          submittedAt: null,
          status: EstimateRequestStatus.SUBMITTED,
          _count: { quotes: 2 },
          confirmedQuote: null,
        },
      ]
    );
    mock.method(
      estimateRequestRepository,
      'getEstimateRequestCount',
      async () => 1
    );

    const result = await getEstimateRequestList(defaultListQuery);

    assert.deepEqual(result.data[0], {
      id: 1,
      userName: '홍길동',
      phoneNumber: '01012345678',
      moveType: null,
      departureAddress: null,
      arrivalAddress: '서울시 강남구',
      submittedAt: null,
      status: EstimateRequestStatus.SUBMITTED,
      estimateCount: 2,
      mover: null,
      missingFields: ['moveType', 'departureAddress', 'submittedAt'],
    });
  });

  it('totalPages를 totalCount와 pageSize로 계산한다', async () => {
    mock.method(
      estimateRequestRepository,
      'findEstimateRequestList',
      async () => []
    );
    mock.method(
      estimateRequestRepository,
      'getEstimateRequestCount',
      async () => 21
    );

    const result = await getEstimateRequestList({
      ...defaultListQuery,
      page: 2,
      pageSize: 10,
    });

    assert.deepEqual(result.meta, {
      page: 2,
      pageSize: 10,
      totalCount: 21,
      totalPages: 3,
    });
  });
});

describe('getEstimateRequestDetail', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('없으면 ADMIN_ESTIMATE_REQUEST_NOT_FOUND를 던진다', async () => {
    mock.method(
      estimateRequestRepository,
      'findEstimateRequestDetailById',
      async () => null
    );

    await assert.rejects(
      () =>
        getEstimateRequestDetail({ estimateRequestId: 1 }, { sort: 'DESC' }),
      assertNotFound
    );
  });

  it('DRAFT이면 상세를 내려주지 않는다', async () => {
    mock.method(
      estimateRequestRepository,
      'findEstimateRequestDetailById',
      async () => ({
        id: 1,
        status: EstimateRequestStatus.DRAFT,
        user: { name: '홍길동', nickname: '길동' },
        moveType: 'SMALL',
        departureZipCode: '12345',
        departureAddress: '서울',
        departureDetailAddress: '101호',
        arrivalZipCode: '54321',
        arrivalAddress: '부산',
        arrivalDetailAddress: '202호',
        submittedAt: SUBMITTED_AT,
        quotes: [],
      })
    );

    await assert.rejects(
      () =>
        getEstimateRequestDetail({ estimateRequestId: 1 }, { sort: 'DESC' }),
      assertNotFound
    );
  });

  it('COMPLETED이면 상세를 내려주지 않는다', async () => {
    mock.method(
      estimateRequestRepository,
      'findEstimateRequestDetailById',
      async () => ({
        id: 1,
        status: EstimateRequestStatus.COMPLETED,
        user: { name: '홍길동', nickname: '길동' },
        moveType: 'SMALL',
        departureZipCode: '12345',
        departureAddress: '서울',
        departureDetailAddress: '101호',
        arrivalZipCode: '54321',
        arrivalAddress: '부산',
        arrivalDetailAddress: '202호',
        submittedAt: SUBMITTED_AT,
        quotes: [],
      })
    );

    await assert.rejects(
      () =>
        getEstimateRequestDetail({ estimateRequestId: 1 }, { sort: 'DESC' }),
      assertNotFound
    );
  });

  it('deletedAt으로 활성·삭제 견적을 나누고 missingFields를 채운다', async () => {
    const createdAt = new Date('2026-08-16T00:00:00.000Z');
    mock.method(
      estimateRequestRepository,
      'findEstimateRequestDetailById',
      async () => ({
        id: 8,
        status: EstimateRequestStatus.SUBMITTED,
        user: { name: '홍길동', nickname: '길동' },
        moveType: null,
        departureZipCode: null,
        departureAddress: '서울',
        departureDetailAddress: '101호',
        arrivalZipCode: '54321',
        arrivalAddress: '부산',
        arrivalDetailAddress: '202호',
        submittedAt: SUBMITTED_AT,
        quotes: [
          {
            id: 1,
            mover: { name: '김기사', nickname: '기사' },
            price: 100000,
            status: QuoteStatus.PENDING,
            createdAt,
            deletedAt: null,
          },
          {
            id: 2,
            mover: null,
            price: null,
            status: QuoteStatus.REJECTED,
            createdAt,
            deletedAt: createdAt,
          },
        ],
      })
    );
    mock.method(dateSortUtil, 'findNeighborIds', async () => ({
      prevId: 7,
      nextId: 9,
    }));

    const result = await getEstimateRequestDetail(
      { estimateRequestId: 8 },
      { sort: 'DESC' }
    );

    assert.equal(result.data.activeQuotesCount, 1);
    assert.equal(result.data.deletedQuotesCount, 1);
    assert.deepEqual(result.data.activeQuotes, [
      {
        id: 1,
        moverName: '김기사',
        moverNickname: '기사',
        price: 100000,
        status: QuoteStatus.PENDING,
        createdAt,
      },
    ]);
    assert.deepEqual(result.data.deletedQuotes, [
      {
        id: 2,
        moverName: null,
        moverNickname: null,
        price: null,
        status: QuoteStatus.REJECTED,
        createdAt,
      },
    ]);
    assert.deepEqual(result.data.missingFields, [
      'moveType',
      'departureZipCode',
    ]);
    assert.equal(result.data.prevId, 7);
    assert.equal(result.data.nextId, 9);
  });
});
