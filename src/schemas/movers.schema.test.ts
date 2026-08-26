import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  moverDetailParamsSchema,
  moversListQuerySchema,
} from './movers.schema';

describe('moversListQuerySchema', () => {
  it('빈 쿼리면 limit만 기본값 10으로 둔다', () => {
    const result = moversListQuerySchema.parse({});

    assert.equal(result.limit, 10);
    assert.equal(result.keyword, undefined);
    assert.equal(result.sort, undefined);
  });

  it('keyword를 trim한다', () => {
    const result = moversListQuerySchema.parse({ keyword: '  친절한  ' });

    assert.equal(result.keyword, '친절한');
  });

  it('keyword가 공백만이면 검증에 실패한다', () => {
    const result = moversListQuerySchema.safeParse({ keyword: '   ' });

    assert.equal(result.success, false);
  });

  it('region·moveType을 콤마 구분 문자열로 받는다', () => {
    const result = moversListQuerySchema.parse({
      region: 'SEOUL,BUSAN',
      moveType: 'HOME,SMALL',
    });

    assert.deepEqual(result.region, ['SEOUL', 'BUSAN']);
    assert.deepEqual(result.moveType, ['HOME', 'SMALL']);
  });

  it('잘못된 region이면 검증에 실패한다', () => {
    const result = moversListQuerySchema.safeParse({ region: 'INVALID' });

    assert.equal(result.success, false);
  });

  it('sort enum을 보존한다', () => {
    assert.equal(
      moversListQuerySchema.parse({ sort: 'averageRating' }).sort,
      'averageRating'
    );
  });

  it('limit가 10을 초과하면 검증에 실패한다', () => {
    const result = moversListQuerySchema.safeParse({ limit: '11' });

    assert.equal(result.success, false);
  });
});

describe('moverDetailParamsSchema', () => {
  it('유효한 UUID면 통과한다', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const result = moverDetailParamsSchema.parse({ id });

    assert.equal(result.id, id);
  });

  it('잘못된 id면 검증에 실패한다', () => {
    const result = moverDetailParamsSchema.safeParse({ id: 'not-a-uuid' });

    assert.equal(result.success, false);
  });
});
