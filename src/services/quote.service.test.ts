import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  EstimateRequestStatus,
  MoveType,
  QuoteStatus,
} from '@prisma/client';
import type { ErrorCode } from '../constants/error.codes';
import type {
  QuoteDetailRow,
  SentQuoteListRow,
} from '../repositories/quote.repository';
import { AppError } from '../utils/app.error';
import {
  getCustomerPastQuotes,
  getCustomerPendingQuotes,
  getQuoteDetail,
  getQuotes,
} from './quote.service';

interface MutableQuoteRepository {
  findQuoteById: (
    quoteId: number
  ) => Promise<QuoteDetailRow | null>;
  findQuotesByMoverWithCount: (params: {
    moverId: string;
    listStatus: 'SENT' | 'REJECTED';
    skip: number;
    take: number;
  }) => Promise<{ items: SentQuoteListRow[]; totalCount: number }>;
  findPendingEstimateRequestWithQuotes: (
    customerId: string
  ) => Promise<unknown>;
  findCustomerPastEstimateRequests: (
    params: unknown
  ) => Promise<{ items: unknown[]; hasNextPage: boolean }>;
}

interface MutableEstimateRequestRepository {
  existsMoverProfile: (userId: string) => Promise<boolean>;
}

interface MutableDesignatedRepository {
  findByEstimateIdAndMoverId: (
    estimateRequestId: number,
    moverId: string
  ) => Promise<{ id: number } | null>;
  findIdsByEstimateIdsAndMoverId: (
    estimateRequestIds: number[],
    moverId: string
  ) => Promise<Map<number, number>>;
}

const quoteRepository =
  require('../repositories/quote.repository') as MutableQuoteRepository;
const estimateRequestRepository =
  require('../repositories/estimate-request.repository') as MutableEstimateRequestRepository;
const designatedEstimateRequestRepository =
  require('../repositories/designated-estimate-request.repository') as MutableDesignatedRepository;

const MOVER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_MOVER_ID = '22222222-2222-4222-8222-222222222222';
const CUSTOMER_ID = '33333333-3333-4333-8333-333333333333';
const MOVE_DATE = new Date('2026-08-15T00:00:00.000Z');
const CREATED_AT = new Date('2026-08-01T00:00:00.000Z');

const originals = {
  findQuoteById: quoteRepository.findQuoteById,
  findQuotesByMoverWithCount: quoteRepository.findQuotesByMoverWithCount,
  findPendingEstimateRequestWithQuotes:
    quoteRepository.findPendingEstimateRequestWithQuotes,
  findCustomerPastEstimateRequests:
    quoteRepository.findCustomerPastEstimateRequests,
  existsMoverProfile: estimateRequestRepository.existsMoverProfile,
  findByEstimateIdAndMoverId:
    designatedEstimateRequestRepository.findByEstimateIdAndMoverId,
  findIdsByEstimateIdsAndMoverId:
    designatedEstimateRequestRepository.findIdsByEstimateIdsAndMoverId,
};

const restoreMocks = () => {
  quoteRepository.findQuoteById = originals.findQuoteById;
  quoteRepository.findQuotesByMoverWithCount =
    originals.findQuotesByMoverWithCount;
  quoteRepository.findPendingEstimateRequestWithQuotes =
    originals.findPendingEstimateRequestWithQuotes;
  quoteRepository.findCustomerPastEstimateRequests =
    originals.findCustomerPastEstimateRequests;
  estimateRequestRepository.existsMoverProfile = originals.existsMoverProfile;
  designatedEstimateRequestRepository.findByEstimateIdAndMoverId =
    originals.findByEstimateIdAndMoverId;
  designatedEstimateRequestRepository.findIdsByEstimateIdsAndMoverId =
    originals.findIdsByEstimateIdsAndMoverId;
};

const assertRejectsWithCode = async (
  fn: () => Promise<unknown>,
  code: ErrorCode
) => {
  await assert.rejects(fn, (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, code);
    return true;
  });
};

const createQuoteDetailRow = (
  overrides: Partial<QuoteDetailRow> = {}
): QuoteDetailRow => ({
  id: 1,
  estimateRequestId: 10,
  moverId: MOVER_ID,
  price: 150000,
  status: QuoteStatus.PENDING,
  comment: '안전하고 빠르게 모시겠습니다.',
  rejectReason: null,
  isDesignated: false,
  estimateRequest: {
    moveType: MoveType.HOME,
    moveDate: MOVE_DATE,
    departureAddress: '서울특별시 강남구 테헤란로 1',
    arrivalAddress: '경기도 성남시 분당구 판교로 2',
    submittedAt: CREATED_AT,
    createdAt: CREATED_AT,
    status: EstimateRequestStatus.SUBMITTED,
    user: { name: '김고객' },
  },
  ...overrides,
});

const createSentQuoteListRow = (
  overrides: Partial<SentQuoteListRow> = {}
): SentQuoteListRow => ({
  id: 1,
  estimateRequestId: 10,
  price: 120000,
  status: QuoteStatus.CONFIRMED,
  isDesignated: false,
  createdAt: CREATED_AT,
  estimateRequest: {
    moveType: MoveType.SMALL,
    moveDate: MOVE_DATE,
    departureAddress: '서울 중구 삼일대로 1',
    arrivalAddress: '서울 용산구 이태원로 2',
    status: EstimateRequestStatus.CONFIRMED,
    user: { name: '이고객' },
  },
  ...overrides,
});

describe('getQuoteDetail', () => {
  afterEach(restoreMocks);

  it('견적이 없으면 QUOTE_NOT_FOUND를 던진다', async () => {
    quoteRepository.findQuoteById = async () => null;

    await assertRejectsWithCode(
      () => getQuoteDetail({ quoteId: 1, moverId: MOVER_ID }),
      'QUOTE_NOT_FOUND'
    );
  });

  it('다른 기사 견적이면 FORBIDDEN을 던진다', async () => {
    quoteRepository.findQuoteById = async () =>
      createQuoteDetailRow({ moverId: OTHER_MOVER_ID });

    await assertRejectsWithCode(
      () => getQuoteDetail({ quoteId: 1, moverId: MOVER_ID }),
      'FORBIDDEN'
    );
  });

  it('본인 견적이면 상세 DTO를 반환한다', async () => {
    quoteRepository.findQuoteById = async () => createQuoteDetailRow();
    designatedEstimateRequestRepository.findByEstimateIdAndMoverId =
      async () => null;

    const result = await getQuoteDetail({ quoteId: 1, moverId: MOVER_ID });

    assert.deepEqual(result, {
      id: 1,
      estimateRequestId: 10,
      price: 150000,
      status: QuoteStatus.PENDING,
      comment: '안전하고 빠르게 모시겠습니다.',
      rejectReason: null,
      estimateRequestStatus: EstimateRequestStatus.SUBMITTED,
      isMoveCompleted: false,
      customer: { name: '김고객' },
      moveType: MoveType.HOME,
      isDesignated: false,
      designatedMoverId: null,
      requestedAt: CREATED_AT,
      moveDate: MOVE_DATE,
      fromAddress: '서울특별시 강남구 테헤란로 1',
      toAddress: '경기도 성남시 분당구 판교로 2',
    });
  });

  it('지정 견적이면 designatedMoverId를 채운다', async () => {
    quoteRepository.findQuoteById = async () =>
      createQuoteDetailRow({ isDesignated: true });
    designatedEstimateRequestRepository.findByEstimateIdAndMoverId =
      async () => ({ id: 99 });

    const result = await getQuoteDetail({ quoteId: 1, moverId: MOVER_ID });

    assert.equal(result.isDesignated, true);
    assert.equal(result.designatedMoverId, 99);
  });
});

describe('getQuotes', () => {
  afterEach(restoreMocks);

  it('프로필이 없으면 PROFILE_NOT_REGISTERED를 던진다', async () => {
    estimateRequestRepository.existsMoverProfile = async () => false;

    await assertRejectsWithCode(
      () =>
        getQuotes({
          moverId: MOVER_ID,
          status: 'SENT',
          page: 1,
          limit: 8,
        }),
      'PROFILE_NOT_REGISTERED'
    );
  });

  it('보낸 견적 목록과 페이지네이션 메타를 반환한다', async () => {
    let receivedParams:
      | {
          moverId: string;
          listStatus: 'SENT' | 'REJECTED';
          skip: number;
          take: number;
        }
      | undefined;

    estimateRequestRepository.existsMoverProfile = async () => true;
    quoteRepository.findQuotesByMoverWithCount = async (params) => {
      receivedParams = params;
      return { items: [createSentQuoteListRow()], totalCount: 9 };
    };
    designatedEstimateRequestRepository.findIdsByEstimateIdsAndMoverId =
      async () => new Map();

    const result = await getQuotes({
      moverId: MOVER_ID,
      status: 'SENT',
      page: 2,
      limit: 8,
    });

    assert.deepEqual(receivedParams, {
      moverId: MOVER_ID,
      listStatus: 'SENT',
      skip: 8,
      take: 8,
    });
    assert.equal(result.items.length, 1);
    assert.deepEqual(result.items[0], {
      id: 1,
      estimateRequestId: 10,
      customer: { name: '이고객' },
      moveType: MoveType.SMALL,
      isConfirmed: true,
      isDesignated: false,
      designatedMoverId: null,
      moveDate: MOVE_DATE,
      fromRegionLabel: '서울 중구',
      toRegionLabel: '서울 용산구',
      price: 120000,
      estimateRequestStatus: EstimateRequestStatus.CONFIRMED,
      isMoveCompleted: false,
      createdAt: CREATED_AT,
    });
    assert.deepEqual(result.meta, {
      totalCount: 9,
      totalPages: 2,
      currentPage: 2,
      limit: 8,
      hasNextPage: false,
      hasPrevPage: true,
    });
  });
});

describe('getCustomerPendingQuotes', () => {
  afterEach(restoreMocks);

  it('SUBMITTED 요청이 없으면 null을 반환한다', async () => {
    quoteRepository.findPendingEstimateRequestWithQuotes = async () => null;

    assert.equal(await getCustomerPendingQuotes(CUSTOMER_ID), null);
  });
});

describe('getCustomerPastQuotes', () => {
  afterEach(restoreMocks);

  it('허용되지 않은 filter면 INVALID_FILTER_TYPE을 던진다', async () => {
    await assertRejectsWithCode(
      () =>
        getCustomerPastQuotes({
          customerId: CUSTOMER_ID,
          limit: 8,
          filter: 'PENDING',
        }),
      'INVALID_FILTER_TYPE'
    );
  });

  it('estimateRequestId로 조회했는데 없으면 ESTIMATE_REQUEST_NOT_FOUND를 던진다', async () => {
    quoteRepository.findCustomerPastEstimateRequests = async () => ({
      items: [],
      hasNextPage: false,
    });

    await assertRejectsWithCode(
      () =>
        getCustomerPastQuotes({
          customerId: CUSTOMER_ID,
          limit: 8,
          filter: 'ALL',
          estimateRequestId: 999,
        }),
      'ESTIMATE_REQUEST_NOT_FOUND'
    );
  });
});
