import assert from 'node:assert/strict';
import { after, before, describe, it, mock } from 'node:test';
import {
  createDateRange,
  createDateRangeOnly,
  getDashboardChartDateRange,
} from './admin-date-range.util';

const DAY_MS = 24 * 60 * 60 * 1000;
/** KST 2026-08-26 달력일 → startOfDayKst는 UTC 자정 Date를 반환한다. */
const AUG_26 = new Date('2026-08-26T00:00:00.000Z');
const AUG_27 = new Date('2026-08-27T00:00:00.000Z');
const AUG_01 = new Date('2026-08-01T00:00:00.000Z');
/** UTC로는 8/25이지만 KST 8/26 00:00 */
const KST_AUG_26_START = new Date('2026-08-25T15:00:00.000Z');

describe('createDateRange', () => {
  it('startDate가 없으면 기간 필터를 두지 않는다', () => {
    assert.equal(createDateRange(), undefined);
    assert.equal(createDateRange(undefined, AUG_26), undefined);
  });

  it('시작일만 있으면 그날 00:00 이상, 다음날 00:00 미만이다', () => {
    assert.deepEqual(createDateRange(AUG_26), {
      gte: AUG_26,
      lt: AUG_27,
    });
  });

  it('시작일과 종료일이 있으면 종료일 다음날 00:00 미만까지 포함한다', () => {
    assert.deepEqual(createDateRange(AUG_01, AUG_26), {
      gte: AUG_01,
      lt: AUG_27,
    });
  });

  it('UTC 날짜가 달라도 KST 달력일을 기준으로 맞춘다', () => {
    assert.deepEqual(createDateRange(KST_AUG_26_START), {
      gte: AUG_26,
      lt: AUG_27,
    });
  });
});

describe('createDateRangeOnly', () => {
  it('createDateRange와 같은 gte/lt를 반환한다', () => {
    assert.deepEqual(
      createDateRangeOnly(AUG_01, AUG_26),
      createDateRange(AUG_01, AUG_26)
    );
    assert.deepEqual(createDateRangeOnly(AUG_26), createDateRange(AUG_26));
    assert.equal(createDateRangeOnly(), createDateRange());
  });
});

describe('getDashboardChartDateRange', () => {
  const NOW = new Date('2026-08-26T03:00:00.000Z');
  const TODAY = AUG_26;

  before(() => {
    mock.timers.enable({ apis: ['Date'], now: NOW });
  });

  after(() => {
    mock.timers.reset();
  });

  it('DAY는 오늘 00:00부터 현재까지이고 hour로 묶는다', () => {
    assert.deepEqual(getDashboardChartDateRange('DAY'), {
      start: TODAY,
      end: NOW,
      groupBy: 'hour',
    });
  });

  it('WEEK는 오늘 포함 7일이고 day로 묶는다', () => {
    assert.deepEqual(getDashboardChartDateRange('WEEK'), {
      start: new Date(TODAY.getTime() - 6 * DAY_MS),
      end: NOW,
      groupBy: 'day',
    });
  });

  it('MONTH는 오늘 포함 30일이고 day로 묶는다', () => {
    assert.deepEqual(getDashboardChartDateRange('MONTH'), {
      start: new Date(TODAY.getTime() - 29 * DAY_MS),
      end: NOW,
      groupBy: 'day',
    });
  });
});
