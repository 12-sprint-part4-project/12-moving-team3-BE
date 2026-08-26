import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { EstimateRequestStatus, MoveType, QuoteStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import * as estimateRequestRepository from '../repositories/admin-estimate-request.repository';
import * as quoteRepository from '../repositories/admin-quote.repository';
import type { AdminCompletedListQuery } from '../schemas/admin-estimate-request.schema';
import { AppError } from '../utils/app.error';
import * as dateSortUtil from '../utils/admin-date-sort.util';
import {
  getCompletedList,
  getCompletedRequestDetail,
  getCompletedStatistics,
} from './admin-completed.service';

const START_DATE = new Date('2026-08-01T00:00:00.000Z');
const END_DATE = new Date('2026-08-26T00:00:00.000Z');
const RANGE_LT = new Date('2026-08-27T00:00:00.000Z');
const MOVE_DATE = new Date('2026-08-20T00:00:00.000Z');

const defaultListQuery: AdminCompletedListQuery = {
  page: 1,
  pageSize: 10,
  sort: 'DESC',
};

const assertNotFound = (error: unknown): boolean => {
  assert.ok(error instanceof AppError);
  assert.equal(error.code, 'ADMIN_ESTIMATE_REQUEST_NOT_FOUND');
  return true;
};

describe('getCompletedStatistics', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('기간은 moveDate 기준이고 확정 견적 금액만 집계하며 평균은 반올림한다', async () => {
    let requestWhere: Prisma.EstimateRequestWhereInput | undefined;
    let quoteWhere: Prisma.QuoteWhereInput | undefined;

    mock.method(
      estimateRequestRepository,
      'getEstimateRequestCount',
      async (where: Prisma.EstimateRequestWhereInput) => {
        requestWhere = where;
        return 4;
      }
    );
    mock.method(
      quoteRepository,
      'averageCompletedQuotePrice',
      async (where: Prisma.QuoteWhereInput) => {
        quoteWhere = where;
        return 12.4;
      }
    );
    mock.method(
      quoteRepository,
      'totalCompletedQuotePrice',
      async () => 100000
    );

    const result = await getCompletedStatistics({
      startDate: START_DATE,
      endDate: END_DATE,
    });

    assert.deepEqual(requestWhere, {
      moveDate: { gte: START_DATE, lt: RANGE_LT },
      status: { in: [EstimateRequestStatus.COMPLETED] },
    });
    assert.deepEqual(quoteWhere, {
      estimateRequest: {
        status: { in: [EstimateRequestStatus.COMPLETED] },
        moveDate: { gte: START_DATE, lt: RANGE_LT },
      },
      status: { in: [QuoteStatus.CONFIRMED] },
    });
    assert.deepEqual(result, {
      totalCompletedCount: 4,
      averageCompletedPrice: 12,
      totalCompletedPrice: 100000,
    });
  });
});

describe('getCompletedList', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('목록은 항상 COMPLETED이고 기간은 moveDate에 붙인다', async () => {
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

    await getCompletedList({
      ...defaultListQuery,
      startDate: START_DATE,
      endDate: END_DATE,
      moveType: MoveType.HOME,
    });

    assert.equal(receivedWhere?.status, EstimateRequestStatus.COMPLETED);
    assert.equal(receivedWhere?.moveType, MoveType.HOME);
    assert.deepEqual(receivedWhere?.moveDate, {
      gte: START_DATE,
      lt: RANGE_LT,
    });
  });

  it('price 0은 누락이 아니고 null인 기사·가격만 missingFields에 넣는다', async () => {
    mock.method(
      estimateRequestRepository,
      'findEstimateRequestList',
      async () => [
        {
          id: 3,
          user: { name: '홍길동', phoneNumber: '01012345678' },
          moveType: MoveType.SMALL,
          departureAddress: '서울',
          arrivalAddress: '부산',
          moveDate: MOVE_DATE,
          confirmedQuote: {
            mover: null,
            price: 0,
          },
        },
      ]
    );
    mock.method(
      estimateRequestRepository,
      'getEstimateRequestCount',
      async () => 1
    );

    const result = await getCompletedList(defaultListQuery);

    assert.deepEqual(result.data[0], {
      id: 3,
      userName: '홍길동',
      phoneNumber: '01012345678',
      moveType: MoveType.SMALL,
      departureAddress: '서울',
      arrivalAddress: '부산',
      moveDate: MOVE_DATE,
      mover: null,
      price: 0,
      missingFields: ['mover'],
    });
  });
});

describe('getCompletedRequestDetail', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('COMPLETED가 아니면 ADMIN_ESTIMATE_REQUEST_NOT_FOUND를 던진다', async () => {
    mock.method(
      estimateRequestRepository,
      'findEstimateRequestDetailById',
      async () => null
    );

    await assert.rejects(
      () =>
        getCompletedRequestDetail({ estimateRequestId: 1 }, { sort: 'DESC' }),
      assertNotFound
    );
  });

  it('confirmedQuote가 있으면 안쪽 필드 누락만 missingFields에 넣는다', async () => {
    mock.method(
      estimateRequestRepository,
      'findEstimateRequestDetailById',
      async () => ({
        id: 5,
        user: { name: '홍길동', nickname: '길동' },
        moveType: MoveType.HOME,
        departureZipCode: '12345',
        departureAddress: '서울',
        departureDetailAddress: '101호',
        arrivalZipCode: '54321',
        arrivalAddress: '부산',
        arrivalDetailAddress: '202호',
        moveDate: MOVE_DATE,
        confirmedQuote: {
          mover: { name: null, nickname: '기사' },
          price: 150000,
          comment: '안전 운송',
          createdAt: MOVE_DATE,
        },
      })
    );
    mock.method(dateSortUtil, 'findNeighborIds', async () => ({
      prevId: null,
      nextId: 6,
    }));

    const result = await getCompletedRequestDetail(
      { estimateRequestId: 5 },
      { sort: 'DESC' }
    );

    assert.deepEqual(result.data.confirmedQuote, {
      moverName: null,
      moverNickname: '기사',
      price: 150000,
      comment: '안전 운송',
      createdAt: MOVE_DATE,
    });
    assert.deepEqual(result.data.missingFields, ['confirmedQuote.moverName']);
    assert.equal(result.data.nextId, 6);
  });

  it('confirmedQuote가 없으면 통째로 누락이다', async () => {
    mock.method(
      estimateRequestRepository,
      'findEstimateRequestDetailById',
      async () => ({
        id: 5,
        user: { name: '홍길동', nickname: '길동' },
        moveType: MoveType.HOME,
        departureZipCode: '12345',
        departureAddress: '서울',
        departureDetailAddress: '101호',
        arrivalZipCode: '54321',
        arrivalAddress: '부산',
        arrivalDetailAddress: '202호',
        moveDate: MOVE_DATE,
        confirmedQuote: null,
      })
    );
    mock.method(dateSortUtil, 'findNeighborIds', async () => ({
      prevId: null,
      nextId: null,
    }));

    const result = await getCompletedRequestDetail(
      { estimateRequestId: 5 },
      { sort: 'DESC' }
    );

    assert.equal(result.data.confirmedQuote, null);
    assert.deepEqual(result.data.missingFields, ['confirmedQuote']);
  });
});
