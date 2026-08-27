import assert from 'node:assert/strict';
import { after, before, describe, it, mock } from 'node:test';
import {
  createDateRange,
  createDateRangeOnly,
  getDashboardChartDateRange,
} from './admin-date-range.util';

const DAY_MS = 24 * 60 * 60 * 1000;
/** 쿼리 YYYY-MM-DD를 UTC 자정으로 파싱한 값 */
const AUG_26 = new Date('2026-08-26T00:00:00.000Z');
const AUG_27 = new Date('2026-08-27T00:00:00.000Z');
const AUG_01 = new Date('2026-08-01T00:00:00.000Z');
/** KST 2026-08-26 00:00 = UTC 2026-08-25 15:00 */
const KST_AUG_26_START = new Date('2026-08-25T15:00:00.000Z');
const KST_AUG_27_START = new Date('2026-08-26T15:00:00.000Z');
const KST_AUG_01_START = new Date('2026-07-31T15:00:00.000Z');

describe('createDateRange', () => {
  it('startDate가 없으면 기간 필터를 두지 않는다', () => {
    assert.equal(createDateRange(), undefined);
    assert.equal(createDateRange(undefined, AUG_26), undefined);
  });

  it('시작일만 있으면 KST 그날 00:00 이상, 다음날 00:00 미만이다', () => {
    assert.deepEqual(createDateRange(AUG_26), {
      gte: KST_AUG_26_START,
      lt: KST_AUG_27_START,
    });
  });

  it('시작일과 종료일이 있으면 종료일 다음날 KST 00:00 미만까지 포함한다', () => {
    assert.deepEqual(createDateRange(AUG_01, AUG_26), {
      gte: KST_AUG_01_START,
      lt: KST_AUG_27_START,
    });
  });
});

describe('createDateRangeOnly', () => {
  it('startDate가 없으면 기간 필터를 두지 않는다', () => {
    assert.equal(createDateRangeOnly(), undefined);
  });

  it('@db.Date용이라 UTC 자정 범위를 반환한다', () => {
    assert.deepEqual(createDateRangeOnly(AUG_01, AUG_26), {
      gte: AUG_01,
      lt: AUG_27,
    });
    assert.deepEqual(createDateRangeOnly(AUG_26), {
      gte: AUG_26,
      lt: AUG_27,
    });
  });

  it('DateTime용 createDateRange와는 다른 범위를 반환한다', () => {
    assert.notDeepEqual(createDateRangeOnly(AUG_26), createDateRange(AUG_26));
  });
});

describe('getDashboardChartDateRange', () => {
  const NOW = new Date('2026-08-26T03:00:00.000Z');
  const TODAY_KST_START = KST_AUG_26_START;

  before(() => {
    mock.timers.enable({ apis: ['Date'], now: NOW });
  });

  after(() => {
    mock.timers.reset();
  });

  it('DAY는 KST 오늘 00:00부터 현재까지이고 hour로 묶는다', () => {
    assert.deepEqual(getDashboardChartDateRange('DAY'), {
      start: TODAY_KST_START,
      end: NOW,
      groupBy: 'hour',
    });
  });

  it('WEEK는 오늘 포함 7일이고 day로 묶는다', () => {
    assert.deepEqual(getDashboardChartDateRange('WEEK'), {
      start: new Date(TODAY_KST_START.getTime() - 6 * DAY_MS),
      end: NOW,
      groupBy: 'day',
    });
  });

  it('MONTH는 오늘 포함 30일이고 day로 묶는다', () => {
    assert.deepEqual(getDashboardChartDateRange('MONTH'), {
      start: new Date(TODAY_KST_START.getTime() - 29 * DAY_MS),
      end: NOW,
      groupBy: 'day',
    });
  });
});
