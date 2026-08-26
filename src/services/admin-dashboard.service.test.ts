import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import {
  EstimateRequestStatus,
  QuoteStatus,
  UserReportStatus,
  UserType,
} from '@prisma/client';
import type { Prisma } from '@prisma/client';
import * as estimateRequestRepository from '../repositories/admin-estimate-request.repository';
import * as quoteRepository from '../repositories/admin-quote.repository';
import * as reportRepository from '../repositories/admin-report.repository';
import * as userRepository from '../repositories/admin-user.repository';
import * as dateRangeUtil from '../utils/admin-date-range.util';
import {
  getRecentActivities,
  getRequestStatus,
  getRequestTrend,
  getStatistics,
} from './admin-dashboard.service';

const START_DATE = new Date('2026-08-01T00:00:00.000Z');
const END_DATE = new Date('2026-08-26T00:00:00.000Z');
const RANGE_LT = new Date('2026-08-27T00:00:00.000Z');
const CHART_START = new Date('2026-08-20T00:00:00.000Z');
const CHART_END = new Date('2026-08-26T03:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

describe('getStatistics', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('회원·요청·견적·완료·대기 신고에 서로 다른 필터를 붙인다', async () => {
    let userWhere: Prisma.UserWhereInput | undefined;
    let quoteWhere: Prisma.QuoteWhereInput | undefined;
    let reportWhere: Prisma.UserReportWhereInput | undefined;
    const requestWheres: Prisma.EstimateRequestWhereInput[] = [];

    mock.method(
      userRepository,
      'getUserCount',
      async (where: Prisma.UserWhereInput) => {
        userWhere = where;
        return 10;
      }
    );
    mock.method(
      estimateRequestRepository,
      'getEstimateRequestCount',
      async (where: Prisma.EstimateRequestWhereInput) => {
        requestWheres.push(where);
        return 5;
      }
    );
    mock.method(
      quoteRepository,
      'getQuoteCount',
      async (where: Prisma.QuoteWhereInput) => {
        quoteWhere = where;
        return 8;
      }
    );
    mock.method(
      reportRepository,
      'getTotalReportCount',
      async (where: Prisma.UserReportWhereInput) => {
        reportWhere = where;
        return 2;
      }
    );

    const result = await getStatistics({
      startDate: START_DATE,
      endDate: END_DATE,
    });

    assert.deepEqual(userWhere, {
      deletedAt: null,
      createdAt: { gte: START_DATE, lt: RANGE_LT },
    });
    assert.deepEqual(requestWheres[0], {
      status: { not: EstimateRequestStatus.DRAFT },
      submittedAt: { gte: START_DATE, lt: RANGE_LT },
    });
    assert.deepEqual(quoteWhere, {
      status: { not: QuoteStatus.REJECTED },
      deletedAt: null,
      createdAt: { gte: START_DATE, lt: RANGE_LT },
    });
    assert.deepEqual(requestWheres[1], {
      status: EstimateRequestStatus.COMPLETED,
      moveDate: { gte: START_DATE, lt: RANGE_LT },
    });
    assert.deepEqual(reportWhere, {
      status: UserReportStatus.PENDING,
      createdAt: { gte: START_DATE, lt: RANGE_LT },
    });
    assert.deepEqual(result, {
      userCount: 10,
      estimateRequestCount: 5,
      quoteCount: 8,
      completedEstimateRequestCount: 5,
      pendingReportCount: 2,
    });
  });
});

describe('getRequestTrend', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('DAY는 24칸이고 없는 시간은 0으로 채운다', async () => {
    const dayStart = new Date('2026-08-26T00:00:00.000Z');
    mock.method(dateRangeUtil, 'getDashboardChartDateRange', () => ({
      start: dayStart,
      end: CHART_END,
      groupBy: 'hour' as const,
    }));
    mock.method(estimateRequestRepository, 'getRequestTrendRows', async () => [
      { bucket: dayStart, count: BigInt(4) },
    ]);

    const result = await getRequestTrend('DAY');

    assert.equal(result.length, 24);
    assert.equal(result[0]?.count, 4);
    assert.equal(result[1]?.count, 0);
    assert.equal(result[0]?.label, '09시');
  });

  it('WEEK는 7칸이고 날짜 라벨을 MM/DD로 붙인다', async () => {
    mock.method(dateRangeUtil, 'getDashboardChartDateRange', () => ({
      start: CHART_START,
      end: CHART_END,
      groupBy: 'day' as const,
    }));
    mock.method(estimateRequestRepository, 'getRequestTrendRows', async () => [
      {
        bucket: new Date(CHART_START.getTime() + 2 * DAY_MS),
        count: BigInt(3),
      },
    ]);

    const result = await getRequestTrend('WEEK');

    assert.equal(result.length, 7);
    assert.equal(result[0]?.label, '08/20');
    assert.equal(result[6]?.label, '08/26');
    assert.equal(result[2]?.count, 3);
    assert.equal(result[0]?.count, 0);
  });

  it('MONTH는 30칸이다', async () => {
    const monthStart = new Date('2026-07-28T00:00:00.000Z');
    mock.method(dateRangeUtil, 'getDashboardChartDateRange', () => ({
      start: monthStart,
      end: CHART_END,
      groupBy: 'day' as const,
    }));
    mock.method(
      estimateRequestRepository,
      'getRequestTrendRows',
      async () => []
    );

    const result = await getRequestTrend('MONTH');

    assert.equal(result.length, 30);
    assert.equal(result[0]?.label, '07/28');
    assert.equal(result[29]?.label, '08/26');
    assert.ok(result.every((item) => item.count === 0));
  });
});

describe('getRequestStatus', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('최근 한 달 상태 합을 total로 반환한다', async () => {
    mock.method(dateRangeUtil, 'getDashboardChartDateRange', () => ({
      start: CHART_START,
      end: CHART_END,
      groupBy: 'day' as const,
    }));
    mock.method(
      estimateRequestRepository,
      'getEstimateRequestStatusStatistics',
      async () => ({
        submitted: 1,
        confirmed: 2,
        completed: 3,
        expired: 4,
        canceled: 5,
      })
    );

    const result = await getRequestStatus();

    assert.deepEqual(result, {
      total: 15,
      submitted: 1,
      confirmed: 2,
      completed: 3,
      expired: 4,
      canceled: 5,
    });
  });
});

describe('getRecentActivities', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('최근 활동은 고객만, 완료 건은 moveDate 기간으로 조회한다', async () => {
    let userWhere: Prisma.UserWhereInput | undefined;
    let completedWhere: Prisma.EstimateRequestWhereInput | undefined;
    const reports = [{ id: 1 }];
    const users = [{ id: 2 }];
    const completed = [{ id: 3 }];

    mock.method(dateRangeUtil, 'getDashboardChartDateRange', () => ({
      start: CHART_START,
      end: CHART_END,
      groupBy: 'day' as const,
    }));
    mock.method(
      reportRepository,
      'getUserReportRecentActivities',
      async () => reports
    );
    mock.method(
      userRepository,
      'getUserRecentActivities',
      async (where: Prisma.UserWhereInput) => {
        userWhere = where;
        return users;
      }
    );
    mock.method(
      estimateRequestRepository,
      'getCompletedEstimateRequestRecentActivities',
      async (where: Prisma.EstimateRequestWhereInput) => {
        completedWhere = where;
        return completed;
      }
    );

    const result = await getRecentActivities();

    assert.deepEqual(userWhere, {
      createdAt: { gte: CHART_START, lte: CHART_END },
      userType: UserType.CUSTOMER,
      deletedAt: null,
    });
    assert.deepEqual(completedWhere, {
      status: EstimateRequestStatus.COMPLETED,
      moveDate: { gte: CHART_START, lt: RANGE_LT },
    });
    assert.deepEqual(result, {
      recentReports: reports,
      recentUsers: users,
      recentCompletedRequests: completed,
    });
  });
});
