import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { EstimateRequestStatus, MoveType, Prisma } from '@prisma/client';
import * as auditContext from '../lib/audit-context';
import * as estimateRequestRepository from '../repositories/estimate-request.repository';
import type { CustomerEstimateRequestRow } from '../repositories/estimate-request.repository';
import { AppError } from '../utils/app.error';
import {
  createEstimateRequest,
  getActiveEstimateRequest,
  getEstimateRequestDetail,
  reviseEstimateRequestField,
  saveEstimateRequestStep,
  submitEstimateRequest,
} from './estimate-request.service';
import * as notificationService from './notification.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';

const baseRow = (
  overrides: Partial<CustomerEstimateRequestRow> = {}
): CustomerEstimateRequestRow =>
  ({
    id: 1,
    userId: USER_ID,
    status: EstimateRequestStatus.DRAFT,
    currentStep: 1,
    totalSteps: 4,
    moveType: null,
    moveDate: null,
    departureZipCode: null,
    departureAddress: null,
    departureDetailAddress: null,
    arrivalZipCode: null,
    arrivalAddress: null,
    arrivalDetailAddress: null,
    submittedAt: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  }) as CustomerEstimateRequestRow;

const assertAppErrorCode = (code: string) => (error: unknown) => {
  assert.ok(error instanceof AppError);
  assert.equal(error.code, code);
  return true;
};

const runTxImmediately = async <T>(
  fn: (tx: unknown) => Promise<T>
): Promise<T> => fn({});

describe('getActiveEstimateRequest', () => {
  afterEach(() => mock.restoreAll());

  it('활성 요청이 없으면 hasActiveRequest:false를 반환한다', async () => {
    mock.method(
      estimateRequestRepository,
      'findActiveEstimateRequest',
      async () => null
    );

    const result = await getActiveEstimateRequest(USER_ID);

    assert.deepEqual(result, { hasActiveRequest: false, request: null });
  });

  it('활성 요청이 있으면 요약 정보를 moveDate는 YYYY-MM-DD로 포맷해 반환한다', async () => {
    mock.method(
      estimateRequestRepository,
      'findActiveEstimateRequest',
      async () =>
        baseRow({
          status: EstimateRequestStatus.SUBMITTED,
          moveDate: new Date('2026-09-01T00:00:00.000Z'),
          departureAddress: '서울특별시 강남구',
          arrivalAddress: '경기도 성남시',
        })
    );

    const result = await getActiveEstimateRequest(USER_ID);

    assert.equal(result.hasActiveRequest, true);
    assert.deepEqual(result.request, {
      id: 1,
      status: EstimateRequestStatus.SUBMITTED,
      currentStep: 1,
      totalSteps: 4,
      moveType: null,
      moveDate: '2026-09-01',
      departureAddress: '서울특별시 강남구',
      arrivalAddress: '경기도 성남시',
    });
  });
});

describe('createEstimateRequest', () => {
  afterEach(() => mock.restoreAll());

  it('활성 요청이 이미 있으면 ACTIVE_REQUEST_EXISTS를 던진다', async () => {
    mock.method(auditContext, 'runAuditedTransaction', runTxImmediately);
    mock.method(
      estimateRequestRepository,
      'findActiveEstimateRequest',
      async () => baseRow()
    );

    await assert.rejects(
      createEstimateRequest(USER_ID),
      assertAppErrorCode('ACTIVE_REQUEST_EXISTS')
    );
  });

  it('DRAFT unique 충돌(P2002)이 나도 ACTIVE_REQUEST_EXISTS로 처리한다', async () => {
    mock.method(auditContext, 'runAuditedTransaction', async () => {
      throw new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: 'test' }
      );
    });

    await assert.rejects(
      createEstimateRequest(USER_ID),
      assertAppErrorCode('ACTIVE_REQUEST_EXISTS')
    );
  });

  it('활성 요청이 없으면 DRAFT를 생성해 반환한다', async () => {
    mock.method(auditContext, 'runAuditedTransaction', runTxImmediately);
    mock.method(
      estimateRequestRepository,
      'findActiveEstimateRequest',
      async () => null
    );
    mock.method(
      estimateRequestRepository,
      'createDraftEstimateRequest',
      async () => baseRow({ id: 5, currentStep: 1, totalSteps: 4 })
    );

    const result = await createEstimateRequest(USER_ID);

    assert.deepEqual(result, {
      id: 5,
      status: EstimateRequestStatus.DRAFT,
      currentStep: 1,
      totalSteps: 4,
    });
  });
});

describe('getEstimateRequestDetail', () => {
  afterEach(() => mock.restoreAll());

  it('요청이 없으면 ESTIMATE_REQUEST_NOT_FOUND를 던진다', async () => {
    mock.method(
      estimateRequestRepository,
      'findEstimateRequestById',
      async () => null
    );

    await assert.rejects(
      getEstimateRequestDetail(1, USER_ID),
      assertAppErrorCode('ESTIMATE_REQUEST_NOT_FOUND')
    );
  });

  it('본인 소유가 아니면 FORBIDDEN을 던진다', async () => {
    mock.method(
      estimateRequestRepository,
      'findEstimateRequestById',
      async () => baseRow({ userId: OTHER_USER_ID })
    );

    await assert.rejects(
      getEstimateRequestDetail(1, USER_ID),
      assertAppErrorCode('FORBIDDEN')
    );
  });

  it('본인 소유면 상세를 반환한다', async () => {
    mock.method(
      estimateRequestRepository,
      'findEstimateRequestById',
      async () => baseRow({ id: 7, moveType: MoveType.HOME })
    );

    const result = await getEstimateRequestDetail(7, USER_ID);

    assert.equal(result.id, 7);
    assert.equal(result.moveType, MoveType.HOME);
  });
});

describe('saveEstimateRequestStep', () => {
  afterEach(() => mock.restoreAll());

  it('step 1은 moveType만 갱신하고 currentStep을 2로 전진한다', async () => {
    mock.method(
      estimateRequestRepository,
      'findEstimateRequestById',
      async () => baseRow({ currentStep: 1 })
    );
    let receivedData: unknown;
    mock.method(
      estimateRequestRepository,
      'updateEstimateRequestDraft',
      async (_id: number, _userId: string, data: unknown) => {
        receivedData = data;
        return baseRow({ currentStep: 2, moveType: MoveType.HOME });
      }
    );

    const result = await saveEstimateRequestStep(1, USER_ID, {
      step: 1,
      data: { moveType: MoveType.HOME },
    });

    assert.deepEqual(receivedData, { moveType: MoveType.HOME, currentStep: 2 });
    assert.equal(result.currentStep, 2);
  });

  it('step 2에서 과거 날짜면 VALIDATION_ERROR를 던진다', async () => {
    mock.method(
      estimateRequestRepository,
      'findEstimateRequestById',
      async () => baseRow()
    );

    await assert.rejects(
      saveEstimateRequestStep(1, USER_ID, {
        step: 2,
        data: { moveDate: '2020-01-01' },
      }),
      assertAppErrorCode('VALIDATION_ERROR')
    );
  });

  it('currentStep은 기존보다 뒤로 가지 않는다', async () => {
    mock.method(
      estimateRequestRepository,
      'findEstimateRequestById',
      async () => baseRow({ currentStep: 3 })
    );
    let receivedData: unknown;
    mock.method(
      estimateRequestRepository,
      'updateEstimateRequestDraft',
      async (_id: number, _userId: string, data: unknown) => {
        receivedData = data;
        return baseRow({ currentStep: 3 });
      }
    );

    await saveEstimateRequestStep(1, USER_ID, {
      step: 1,
      data: { moveType: MoveType.HOME },
    });

    assert.deepEqual(receivedData, { moveType: MoveType.HOME, currentStep: 3 });
  });

  it('경합으로 갱신 행이 없으면 재검증 후 ESTIMATE_REQUEST_NOT_FOUND를 던진다', async () => {
    mock.method(
      estimateRequestRepository,
      'findEstimateRequestById',
      async () => baseRow()
    );
    mock.method(
      estimateRequestRepository,
      'updateEstimateRequestDraft',
      async () => null
    );

    await assert.rejects(
      saveEstimateRequestStep(1, USER_ID, {
        step: 1,
        data: { moveType: MoveType.HOME },
      }),
      assertAppErrorCode('ESTIMATE_REQUEST_NOT_FOUND')
    );
  });
});

describe('reviseEstimateRequestField', () => {
  afterEach(() => mock.restoreAll());

  it('moveDate가 과거면 VALIDATION_ERROR를 던진다', async () => {
    mock.method(
      estimateRequestRepository,
      'findEstimateRequestById',
      async () => baseRow()
    );

    await assert.rejects(
      reviseEstimateRequestField(1, USER_ID, {
        field: 'moveDate',
        value: '2020-01-01',
      }),
      assertAppErrorCode('VALIDATION_ERROR')
    );
  });

  it('moveType이 유효하지 않으면 VALIDATION_ERROR를 던진다', async () => {
    mock.method(
      estimateRequestRepository,
      'findEstimateRequestById',
      async () => baseRow()
    );

    await assert.rejects(
      reviseEstimateRequestField(1, USER_ID, {
        field: 'moveType',
        value: 'INVALID',
      }),
      assertAppErrorCode('VALIDATION_ERROR')
    );
  });

  it('응답에는 수정한 필드만 포함된다', async () => {
    mock.method(
      estimateRequestRepository,
      'findEstimateRequestById',
      async () => baseRow()
    );
    mock.method(
      estimateRequestRepository,
      'updateEstimateRequestDraft',
      async () => baseRow({ departureAddress: '서울특별시 강남구' })
    );

    const result = await reviseEstimateRequestField(1, USER_ID, {
      field: 'departureAddress',
      value: '서울특별시 강남구',
    });

    assert.deepEqual(result, { id: 1, departureAddress: '서울특별시 강남구' });
  });
});

describe('submitEstimateRequest', () => {
  afterEach(() => mock.restoreAll());

  it('필수 필드가 비어있으면 REQUIRED_FIELD_MISSING을 던진다', async () => {
    mock.method(
      estimateRequestRepository,
      'findEstimateRequestById',
      async () => baseRow()
    );

    await assert.rejects(
      submitEstimateRequest(1, USER_ID),
      assertAppErrorCode('REQUIRED_FIELD_MISSING')
    );
  });

  it('알림 발송이 실패해도 제출 자체는 성공한다', async () => {
    mock.method(
      estimateRequestRepository,
      'findEstimateRequestById',
      async () =>
        baseRow({
          moveType: MoveType.HOME,
          moveDate: new Date('2026-09-01T00:00:00.000Z'),
          departureZipCode: '06236',
          departureAddress: '서울특별시 강남구 테헤란로 1',
          arrivalZipCode: '13561',
          arrivalAddress: '경기도 성남시 분당구 판교로 2',
        })
    );
    mock.method(estimateRequestRepository, 'submitEstimateRequest', async () =>
      baseRow({
        status: EstimateRequestStatus.SUBMITTED,
        submittedAt: new Date('2026-08-26T00:00:00.000Z'),
      })
    );
    mock.method(
      notificationService,
      'enqueueNewQuoteRequestFanout',
      async () => {
        throw new Error('outbox enqueue boom');
      }
    );

    const result = await submitEstimateRequest(1, USER_ID);

    assert.equal(result.status, EstimateRequestStatus.SUBMITTED);
    assert.equal(result.submittedAt, '2026-08-26T00:00:00.000Z');
  });
});
