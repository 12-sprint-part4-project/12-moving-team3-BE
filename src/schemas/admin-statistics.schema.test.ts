import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { adminStatisticsFilterSchema } from './admin-statistics.schema';

describe('adminStatisticsFilterSchema', () => {
  it('YYYY-MM-DD를 UTC 자정 Date로 변환한다', () => {
    const result = adminStatisticsFilterSchema.parse({
      startDate: '2026-08-26',
    });

    assert.deepEqual(result.startDate, new Date('2026-08-26T00:00:00.000Z'));
    assert.equal(result.endDate, undefined);
  });

  it('종료일만 있으면 검증에 실패한다', () => {
    const result = adminStatisticsFilterSchema.safeParse({
      endDate: '2026-08-26',
    });

    assert.equal(result.success, false);
  });

  it('종료일이 시작일보다 이전이면 검증에 실패한다', () => {
    const result = adminStatisticsFilterSchema.safeParse({
      startDate: '2026-08-26',
      endDate: '2026-08-01',
    });

    assert.equal(result.success, false);
  });

  it('시작일만 있거나 같은 날·정상 기간이면 성공한다', () => {
    assert.equal(
      adminStatisticsFilterSchema.safeParse({ startDate: '2026-08-26' })
        .success,
      true
    );
    assert.equal(
      adminStatisticsFilterSchema.safeParse({
        startDate: '2026-08-26',
        endDate: '2026-08-26',
      }).success,
      true
    );

    const range = adminStatisticsFilterSchema.parse({
      startDate: '2026-08-01',
      endDate: '2026-08-26',
    });

    assert.deepEqual(range.startDate, new Date('2026-08-01T00:00:00.000Z'));
    assert.deepEqual(range.endDate, new Date('2026-08-26T00:00:00.000Z'));
  });
});
