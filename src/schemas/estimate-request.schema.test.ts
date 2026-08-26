import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  estimateRequestIdParamsSchema,
  estimateRequestListQuerySchema,
  reviseEstimateRequestFieldBodySchema,
  saveEstimateRequestStepBodySchema,
} from './estimate-request.schema';

describe('estimateRequestListQuerySchema', () => {
  it('파라미터가 없으면 sort·limit 기본값을 적용한다', () => {
    assert.deepEqual(estimateRequestListQuerySchema.parse({}), {
      sort: 'MOVE_DATE_ASC',
      limit: 10,
    });
  });

  it('keyword를 trim하고 boolean 쿼리를 변환한다', () => {
    assert.deepEqual(
      estimateRequestListQuerySchema.parse({
        keyword: '  김고객  ',
        designated: 'true',
        serviceArea: 'false',
        sort: 'SUBMITTED_AT_ASC',
        cursor: 'cursor-token',
        limit: '5',
      }),
      {
        keyword: '김고객',
        designated: true,
        serviceArea: false,
        sort: 'SUBMITTED_AT_ASC',
        cursor: 'cursor-token',
        limit: 5,
      }
    );
  });

  it('moveType 쉼표 구분 문자열을 배열로 정규화한다', () => {
    assert.deepEqual(
      estimateRequestListQuerySchema.parse({ moveType: 'HOME,SMALL' }).moveType,
      ['HOME', 'SMALL']
    );
  });

  it('moveType 배열 형태도 허용한다', () => {
    assert.deepEqual(
      estimateRequestListQuerySchema.parse({
        moveType: ['OFFICE', 'HOME'],
      }).moveType,
      ['OFFICE', 'HOME']
    );
  });

  it('keyword가 공백만 있으면 검증에 실패한다', () => {
    assert.equal(
      estimateRequestListQuerySchema.safeParse({ keyword: '   ' }).success,
      false
    );
  });

  it('허용되지 않은 sort면 검증에 실패한다', () => {
    assert.equal(
      estimateRequestListQuerySchema.safeParse({ sort: 'MOVE_DATE_DESC' })
        .success,
      false
    );
  });

  it('limit가 20을 초과하면 검증에 실패한다', () => {
    assert.equal(
      estimateRequestListQuerySchema.safeParse({ limit: '21' }).success,
      false
    );
  });
});

describe('estimateRequestIdParamsSchema', () => {
  it('estimateRequestId를 양수 정수로 변환한다', () => {
    assert.deepEqual(
      estimateRequestIdParamsSchema.parse({ estimateRequestId: '9' }),
      { estimateRequestId: 9 }
    );
  });
});

describe('saveEstimateRequestStepBodySchema', () => {
  it('step 1은 moveType을 검증한다', () => {
    assert.deepEqual(
      saveEstimateRequestStepBodySchema.parse({
        step: 1,
        data: { moveType: 'HOME' },
      }),
      {
        step: 1,
        data: { moveType: 'HOME' },
      }
    );
  });

  it('step 2는 YYYY-MM-DD 이사일을 검증한다', () => {
    assert.deepEqual(
      saveEstimateRequestStepBodySchema.parse({
        step: 2,
        data: { moveDate: '2026-08-15' },
      }),
      {
        step: 2,
        data: { moveDate: '2026-08-15' },
      }
    );
  });

  it('step 2에서 존재하지 않는 날짜면 검증에 실패한다', () => {
    assert.equal(
      saveEstimateRequestStepBodySchema.safeParse({
        step: 2,
        data: { moveDate: '2026-02-31' },
      }).success,
      false
    );
  });

  it('step 3은 상세주소를 빈 문자열 기본값으로 둔다', () => {
    assert.deepEqual(
      saveEstimateRequestStepBodySchema.parse({
        step: 3,
        data: {
          departureZipCode: '06236',
          departureAddress: '서울특별시 강남구 테헤란로 1',
          arrivalZipCode: '13561',
          arrivalAddress: '경기도 성남시 분당구 판교로 2',
        },
      }),
      {
        step: 3,
        data: {
          departureZipCode: '06236',
          departureAddress: '서울특별시 강남구 테헤란로 1',
          departureDetailAddress: '',
          arrivalZipCode: '13561',
          arrivalAddress: '경기도 성남시 분당구 판교로 2',
          arrivalDetailAddress: '',
        },
      }
    );
  });
});

describe('reviseEstimateRequestFieldBodySchema', () => {
  it('필수 필드는 빈 값을 허용하지 않는다', () => {
    assert.equal(
      reviseEstimateRequestFieldBodySchema.safeParse({
        field: 'moveType',
        value: '   ',
      }).success,
      false
    );
  });

  it('상세주소 필드는 빈 값을 허용한다', () => {
    assert.deepEqual(
      reviseEstimateRequestFieldBodySchema.parse({
        field: 'departureDetailAddress',
        value: '',
      }),
      {
        field: 'departureDetailAddress',
        value: '',
      }
    );
  });

  it('값을 trim한다', () => {
    assert.deepEqual(
      reviseEstimateRequestFieldBodySchema.parse({
        field: 'arrivalAddress',
        value: '  서울특별시 용산구 이태원로 2  ',
      }),
      {
        field: 'arrivalAddress',
        value: '서울특별시 용산구 이태원로 2',
      }
    );
  });
});
