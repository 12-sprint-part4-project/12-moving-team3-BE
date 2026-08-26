import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  pastQuotesQuerySchema,
  quoteBodySchema,
  quoteIdParamsSchema,
  quoteListQuerySchema,
  quoteParamsSchema,
} from './quote.schema';

describe('quoteParamsSchema', () => {
  it('estimateRequestId를 양수 정수로 변환한다', () => {
    assert.deepEqual(quoteParamsSchema.parse({ estimateRequestId: '12' }), {
      estimateRequestId: 12,
    });
  });

  it('0·음수·문자면 검증에 실패한다', () => {
    assert.equal(
      quoteParamsSchema.safeParse({ estimateRequestId: '0' }).success,
      false
    );
    assert.equal(
      quoteParamsSchema.safeParse({ estimateRequestId: '-1' }).success,
      false
    );
    assert.equal(
      quoteParamsSchema.safeParse({ estimateRequestId: 'abc' }).success,
      false
    );
  });
});

describe('quoteIdParamsSchema', () => {
  it('quoteId를 양수 정수로 변환한다', () => {
    assert.deepEqual(quoteIdParamsSchema.parse({ quoteId: '7' }), {
      quoteId: 7,
    });
  });
});

describe('quoteListQuerySchema', () => {
  it('status만 있으면 page=1·limit=8 기본값을 적용한다', () => {
    assert.deepEqual(quoteListQuerySchema.parse({ status: 'SENT' }), {
      status: 'SENT',
      page: 1,
      limit: 8,
    });
  });

  it('REJECTED와 page·limit를 그대로 보존한다', () => {
    assert.deepEqual(
      quoteListQuerySchema.parse({
        status: 'REJECTED',
        page: '2',
        limit: '10',
      }),
      {
        status: 'REJECTED',
        page: 2,
        limit: 10,
      }
    );
  });

  it('허용되지 않은 status면 검증에 실패한다', () => {
    assert.equal(
      quoteListQuerySchema.safeParse({ status: 'PENDING' }).success,
      false
    );
  });

  it('limit가 50을 초과하면 검증에 실패한다', () => {
    assert.equal(
      quoteListQuerySchema.safeParse({ status: 'SENT', limit: '51' }).success,
      false
    );
  });
});

describe('quoteBodySchema', () => {
  it('PROPOSAL은 price·comment를 검증한다', () => {
    assert.deepEqual(
      quoteBodySchema.parse({
        type: 'PROPOSAL',
        price: 150000,
        comment: '안전하고 빠르게 모시겠습니다.',
      }),
      {
        type: 'PROPOSAL',
        price: 150000,
        comment: '안전하고 빠르게 모시겠습니다.',
      }
    );
  });

  it('PROPOSAL comment가 10자 미만이면 검증에 실패한다', () => {
    assert.equal(
      quoteBodySchema.safeParse({
        type: 'PROPOSAL',
        price: 100000,
        comment: '짧음',
      }).success,
      false
    );
  });

  it('PROPOSAL price가 0이면 검증에 실패한다', () => {
    assert.equal(
      quoteBodySchema.safeParse({
        type: 'PROPOSAL',
        price: 0,
        comment: '안전하고 빠르게 모시겠습니다.',
      }).success,
      false
    );
  });

  it('REJECTION은 rejectReason을 trim한다', () => {
    assert.deepEqual(
      quoteBodySchema.parse({
        type: 'REJECTION',
        rejectReason: '  일정이 맞지 않아 반려합니다.  ',
      }),
      {
        type: 'REJECTION',
        rejectReason: '일정이 맞지 않아 반려합니다.',
      }
    );
  });

  it('REJECTION rejectReason이 10자 미만이면 검증에 실패한다', () => {
    assert.equal(
      quoteBodySchema.safeParse({
        type: 'REJECTION',
        rejectReason: '짧음',
      }).success,
      false
    );
  });
});

describe('pastQuotesQuerySchema', () => {
  it('기본값으로 limit=8·filter=ALL을 적용한다', () => {
    assert.deepEqual(pastQuotesQuerySchema.parse({}), {
      limit: 8,
      filter: 'ALL',
    });
  });

  it('cursor·estimateRequestId·filter를 변환한다', () => {
    assert.deepEqual(
      pastQuotesQuerySchema.parse({
        cursor: '20',
        limit: '4',
        estimateRequestId: '15',
        filter: 'CONFIRMED',
      }),
      {
        cursor: 20,
        limit: 4,
        estimateRequestId: 15,
        filter: 'CONFIRMED',
      }
    );
  });
});
