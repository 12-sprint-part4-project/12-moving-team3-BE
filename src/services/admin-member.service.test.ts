import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import {
  HistoryAction,
  MoveType,
  Prisma,
  Region,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as auditContext from '../lib/audit-context';
import type {
  AdminMemberDetailRow,
  AdminMemberListRow,
  AdminMemberStatusRow,
} from '../repositories/admin-member.repository';
import * as adminMemberRepository from '../repositories/admin-member.repository';
import * as historyRepository from '../repositories/history.repository';
import reviewRepository from '../repositories/review.repository';
import type {
  AdminMemberDetailQuery,
  AdminMemberListQuery,
} from '../schemas/admin-member.schema';
import { AppError } from '../utils/app.error';
import {
  activateAdminMember,
  getAdminMemberDetail,
  getAdminMemberList,
  suspendAdminMember,
} from './admin-member.service';
import * as notificationService from './notification.service';
import type { NotifySanctionParams } from './notification.service';

const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const MOVER_ID_1 = '22222222-2222-4222-8222-222222222222';
const MOVER_ID_2 = '33333333-3333-4333-8333-333333333333';
const PREV_ID = '44444444-4444-4444-8444-444444444444';
const NEXT_ID = '55555555-5555-4555-8555-555555555555';
const ADMIN_ID = 7;
const FIXED_NOW = new Date('2026-08-26T12:00:00.000Z');
const SUSPEND_UNTIL = new Date(FIXED_NOW.getTime() + 7 * 24 * 60 * 60 * 1000);
const CREATED_AT = new Date('2026-08-15T00:00:00.000Z');
const SUSPENDED_AT = new Date('2026-08-20T00:00:00.000Z');
const SUSPENDED_UNTIL = new Date('2026-08-27T00:00:00.000Z');

const defaultListQuery: AdminMemberListQuery = {
  page: 1,
  pageSize: 10,
  sort: 'DESC',
};

const defaultDetailQuery: AdminMemberDetailQuery = {
  userType: UserType.CUSTOMER,
  sort: 'DESC',
};

const toListWhereParams = (
  query: AdminMemberDetailQuery
): Parameters<typeof adminMemberRepository.buildAdminMemberListWhere>[0] => ({
  userType: query.userType,
  status: query.status,
  userName: query.userName,
  email: query.email,
  phoneNumber: query.phoneNumber,
  startDate: query.startDate,
  endDate: query.endDate,
});

const runManualAuditImmediately = async <T>(fn: () => Promise<T>) => fn();

const assertMemberNotFound = (error: unknown): boolean => {
  assert.ok(error instanceof AppError);
  assert.equal(error.code, 'ADMIN_MEMBER_NOT_FOUND');
  return true;
};

const runTxImmediately = async <T>(
  fn: (tx: unknown) => Promise<T>
): Promise<T> => fn({});

const buildListRow = (
  overrides: Partial<AdminMemberListRow> = {}
): AdminMemberListRow => ({
  id: CUSTOMER_ID,
  name: '홍길동',
  nickname: '길동',
  email: 'customer@example.com',
  phoneNumber: '01012345678',
  userType: UserType.CUSTOMER,
  createdAt: CREATED_AT,
  userStatus: null,
  ...overrides,
});

const buildDetailRow = (
  overrides: Partial<AdminMemberDetailRow> = {}
): AdminMemberDetailRow => ({
  id: CUSTOMER_ID,
  name: '홍길동',
  nickname: '길동',
  email: 'customer@example.com',
  phoneNumber: '01012345678',
  profileImageKey: null,
  userType: UserType.CUSTOMER,
  createdAt: CREATED_AT,
  userStatus: null,
  customerProfile: {
    id: 1,
    region: Region.SEOUL,
    service: [MoveType.SMALL],
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  },
  moverProfile: null,
  ...overrides,
});

const emptyReviewStats = () => ({
  ratingCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  totalCount: 0,
  averageRating: null,
});

describe('getAdminMemberList', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('findAdminMembersWithCount에 query를 그대로 전달하고 페이지네이션을 계산한다', async () => {
    let receivedParams: AdminMemberListQuery | undefined;
    mock.method(
      adminMemberRepository,
      'findAdminMembersWithCount',
      async (params: AdminMemberListQuery) => {
        receivedParams = params;
        return { items: [], totalCount: 21 };
      }
    );
    mock.method(
      reviewRepository,
      'getReviewStatsByMoverIds',
      async () => new Map()
    );

    const params: AdminMemberListQuery = {
      page: 2,
      pageSize: 10,
      sort: 'DESC',
      userType: UserType.CUSTOMER,
    };
    const result = await getAdminMemberList(params);

    assert.deepEqual(receivedParams, params);
    assert.deepEqual(result.pagination, {
      page: 2,
      pageSize: 10,
      totalCount: 21,
      totalPages: 3,
    });
    assert.deepEqual(result.items, []);
  });

  it('totalCount가 0이면 totalPages도 0이다', async () => {
    mock.method(
      adminMemberRepository,
      'findAdminMembersWithCount',
      async () => ({ items: [], totalCount: 0 })
    );
    mock.method(
      reviewRepository,
      'getReviewStatsByMoverIds',
      async () => new Map()
    );

    const result = await getAdminMemberList(defaultListQuery);

    assert.equal(result.pagination.totalPages, 0);
  });

  describe('CUSTOMER 회원 목록', () => {
    it('평점 조회 대상에 포함하지 않고 averageRating은 null이다', async () => {
      let receivedMoverIds: string[] | undefined;
      mock.method(
        adminMemberRepository,
        'findAdminMembersWithCount',
        async () => ({
          items: [
            buildListRow({
              userStatus: {
                status: UserStatus.SUSPENDED,
                suspendedAt: SUSPENDED_AT,
                suspendedUntil: SUSPENDED_UNTIL,
              },
            }),
          ],
          totalCount: 1,
        })
      );
      mock.method(
        reviewRepository,
        'getReviewStatsByMoverIds',
        async (moverIds: string[]) => {
          receivedMoverIds = moverIds;
          return new Map();
        }
      );

      const result = await getAdminMemberList({
        ...defaultListQuery,
        userType: UserType.CUSTOMER,
      });

      assert.deepEqual(receivedMoverIds, []);
      assert.deepEqual(result.items, [
        {
          id: CUSTOMER_ID,
          name: '홍길동',
          nickname: '길동',
          email: 'customer@example.com',
          phoneNumber: '01012345678',
          userType: UserType.CUSTOMER,
          status: UserStatus.SUSPENDED,
          suspendedAt: SUSPENDED_AT,
          suspendedUntil: SUSPENDED_UNTIL,
          createdAt: CREATED_AT,
          averageRating: null,
        },
      ]);
    });

    it('userStatus가 없으면 ACTIVE로 정규화한다', async () => {
      mock.method(
        adminMemberRepository,
        'findAdminMembersWithCount',
        async () => ({
          items: [buildListRow({ userStatus: null })],
          totalCount: 1,
        })
      );
      mock.method(
        reviewRepository,
        'getReviewStatsByMoverIds',
        async () => new Map()
      );

      const result = await getAdminMemberList({
        ...defaultListQuery,
        userType: UserType.CUSTOMER,
      });

      assert.equal(result.items[0]?.status, UserStatus.ACTIVE);
      assert.equal(result.items[0]?.suspendedAt, null);
      assert.equal(result.items[0]?.suspendedUntil, null);
    });
  });

  describe('MOVER 기사 목록', () => {
    it('MOVER ID만 추출해 getReviewStatsByMoverIds에 전달한다', async () => {
      let receivedMoverIds: string[] | undefined;
      mock.method(
        adminMemberRepository,
        'findAdminMembersWithCount',
        async () => ({
          items: [
            buildListRow({ id: CUSTOMER_ID, userType: UserType.CUSTOMER }),
            buildListRow({
              id: MOVER_ID_1,
              userType: UserType.MOVER,
              name: '김기사',
              nickname: '기사1',
              email: 'mover1@example.com',
            }),
            buildListRow({
              id: MOVER_ID_2,
              userType: UserType.MOVER,
              name: '이기사',
              nickname: '기사2',
              email: 'mover2@example.com',
            }),
          ],
          totalCount: 3,
        })
      );
      mock.method(
        reviewRepository,
        'getReviewStatsByMoverIds',
        async (moverIds: string[]) => {
          receivedMoverIds = moverIds;
          return new Map([
            [
              MOVER_ID_1,
              { ...emptyReviewStats(), averageRating: 4.5, totalCount: 2 },
            ],
            [
              MOVER_ID_2,
              { ...emptyReviewStats(), averageRating: 3, totalCount: 1 },
            ],
          ]);
        }
      );

      const result = await getAdminMemberList({
        ...defaultListQuery,
        userType: UserType.MOVER,
      });

      assert.deepEqual(receivedMoverIds, [MOVER_ID_1, MOVER_ID_2]);
      assert.equal(result.items[0]?.averageRating, null);
      assert.equal(result.items[1]?.averageRating, 4.5);
      assert.equal(result.items[2]?.averageRating, 3);
    });

    it('평점 집계 Map에 기사가 없으면 averageRating은 null이다', async () => {
      mock.method(
        adminMemberRepository,
        'findAdminMembersWithCount',
        async () => ({
          items: [
            buildListRow({
              id: MOVER_ID_1,
              userType: UserType.MOVER,
              name: '김기사',
            }),
          ],
          totalCount: 1,
        })
      );
      mock.method(
        reviewRepository,
        'getReviewStatsByMoverIds',
        async () => new Map()
      );

      const result = await getAdminMemberList({
        ...defaultListQuery,
        userType: UserType.MOVER,
      });

      assert.equal(result.items[0]?.averageRating, null);
    });

    it('빈 목록이면 MOVER ID 없이 빈 Map을 조회한다', async () => {
      let receivedMoverIds: string[] | undefined;
      mock.method(
        adminMemberRepository,
        'findAdminMembersWithCount',
        async () => ({ items: [], totalCount: 0 })
      );
      mock.method(
        reviewRepository,
        'getReviewStatsByMoverIds',
        async (moverIds: string[]) => {
          receivedMoverIds = moverIds;
          return new Map();
        }
      );

      await getAdminMemberList({
        ...defaultListQuery,
        userType: UserType.MOVER,
      });

      assert.deepEqual(receivedMoverIds, []);
    });
  });
});

describe('getAdminMemberDetail', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('회원이 없으면 ADMIN_MEMBER_NOT_FOUND를 던진다', async () => {
    mock.method(
      adminMemberRepository,
      'findAdminMemberDetail',
      async () => null
    );

    await assert.rejects(
      () => getAdminMemberDetail(CUSTOMER_ID, defaultDetailQuery),
      assertMemberNotFound
    );
  });

  describe('CUSTOMER 상세', () => {
    it('리뷰·확정 견적 집계를 조회하지 않고 기본값을 반환한다', async () => {
      let reviewStatsCalled = false;
      let confirmedQuotesCalled = false;

      mock.method(adminMemberRepository, 'findAdminMemberDetail', async () =>
        buildDetailRow()
      );
      mock.method(
        adminMemberRepository,
        'countAdminMemberReports',
        async () => 3
      );
      mock.method(reviewRepository, 'getReviewStatsByMoverId', async () => {
        reviewStatsCalled = true;
        return emptyReviewStats();
      });
      mock.method(
        adminMemberRepository,
        'countConfirmedQuotesByMoverId',
        async () => {
          confirmedQuotesCalled = true;
          return 5;
        }
      );
      mock.method(adminMemberRepository, 'findAdminMemberFirst', async () => ({
        id: CUSTOMER_ID,
      }));

      const result = await getAdminMemberDetail(
        CUSTOMER_ID,
        defaultDetailQuery
      );

      assert.equal(reviewStatsCalled, false);
      assert.equal(confirmedQuotesCalled, false);
      assert.equal(result.reportCount, 3);
      assert.equal(result.averageRating, null);
      assert.equal(result.reviewCount, 0);
      assert.equal(result.confirmedQuoteCount, 0);
    });
  });

  describe('MOVER 상세', () => {
    it('리뷰 통계와 확정 견적 수를 조합해 반환한다', async () => {
      mock.method(adminMemberRepository, 'findAdminMemberDetail', async () =>
        buildDetailRow({
          id: MOVER_ID_1,
          userType: UserType.MOVER,
          customerProfile: null,
          moverProfile: {
            id: 10,
            service: [MoveType.SMALL],
            career: 5,
            shortDescription: '짧은 소개',
            description: '긴 소개',
            createdAt: CREATED_AT,
            updatedAt: CREATED_AT,
            serviceRegions: [{ region: Region.SEOUL }],
          },
        })
      );
      mock.method(
        adminMemberRepository,
        'countAdminMemberReports',
        async () => 1
      );
      mock.method(
        reviewRepository,
        'getReviewStatsByMoverId',
        async (moverId: string) => {
          assert.equal(moverId, MOVER_ID_1);
          return {
            ...emptyReviewStats(),
            totalCount: 4,
            averageRating: 4.25,
          };
        }
      );
      mock.method(
        adminMemberRepository,
        'countConfirmedQuotesByMoverId',
        async (moverId: string) => {
          assert.equal(moverId, MOVER_ID_1);
          return 6;
        }
      );
      mock.method(adminMemberRepository, 'findAdminMemberFirst', async () => ({
        id: MOVER_ID_1,
      }));

      const result = await getAdminMemberDetail(MOVER_ID_1, {
        userType: UserType.MOVER,
        sort: 'DESC',
      });

      assert.equal(result.averageRating, 4.25);
      assert.equal(result.reviewCount, 4);
      assert.equal(result.confirmedQuoteCount, 6);
    });

    it('리뷰 통계가 없으면 평점과 리뷰 수를 기본값으로 변환한다', async () => {
      mock.method(adminMemberRepository, 'findAdminMemberDetail', async () =>
        buildDetailRow({
          id: MOVER_ID_1,
          userType: UserType.MOVER,
          customerProfile: null,
          moverProfile: null,
        })
      );
      mock.method(
        adminMemberRepository,
        'countAdminMemberReports',
        async () => 0
      );
      mock.method(reviewRepository, 'getReviewStatsByMoverId', async () =>
        emptyReviewStats()
      );
      mock.method(
        adminMemberRepository,
        'countConfirmedQuotesByMoverId',
        async () => 0
      );
      mock.method(adminMemberRepository, 'findAdminMemberFirst', async () => ({
        id: MOVER_ID_1,
      }));

      const result = await getAdminMemberDetail(MOVER_ID_1, {
        userType: UserType.MOVER,
        sort: 'DESC',
      });

      assert.equal(result.averageRating, null);
      assert.equal(result.reviewCount, 0);
    });
  });

  describe('이전·다음 회원', () => {
    const memberInFilter = { id: CUSTOMER_ID, createdAt: CREATED_AT };

    it('현재 회원이 목록 필터 밖이면 prevId와 nextId가 모두 null이다', async () => {
      mock.method(adminMemberRepository, 'findAdminMemberDetail', async () =>
        buildDetailRow()
      );
      mock.method(
        adminMemberRepository,
        'countAdminMemberReports',
        async () => 0
      );
      mock.method(
        adminMemberRepository,
        'findAdminMemberFirst',
        async () => null
      );

      const result = await getAdminMemberDetail(
        CUSTOMER_ID,
        defaultDetailQuery
      );

      assert.equal(result.prevId, null);
      assert.equal(result.nextId, null);
    });

    it('sort=DESC일 때 이전·다음 조회 조건과 정렬을 사용한다', async () => {
      const neighborCalls: Array<{
        where: Prisma.UserWhereInput;
        orderBy: Prisma.UserOrderByWithRelationInput[];
      }> = [];
      let callIndex = 0;

      mock.method(adminMemberRepository, 'findAdminMemberDetail', async () =>
        buildDetailRow()
      );
      mock.method(
        adminMemberRepository,
        'countAdminMemberReports',
        async () => 0
      );
      mock.method(
        adminMemberRepository,
        'findAdminMemberFirst',
        async (
          where: Prisma.UserWhereInput,
          orderBy: Prisma.UserOrderByWithRelationInput[]
        ) => {
          callIndex += 1;
          if (callIndex === 1) {
            return memberInFilter;
          }
          neighborCalls.push({ where, orderBy });
          return null;
        }
      );

      await getAdminMemberDetail(CUSTOMER_ID, {
        ...defaultDetailQuery,
        sort: 'DESC',
      });

      assert.equal(neighborCalls.length, 2);
      assert.deepEqual(neighborCalls[0]?.orderBy, [
        { createdAt: 'asc' },
        { id: 'asc' },
      ]);
      assert.deepEqual(neighborCalls[1]?.orderBy, [
        { createdAt: 'desc' },
        { id: 'desc' },
      ]);
      assert.deepEqual(neighborCalls[0]?.where, {
        AND: [
          adminMemberRepository.buildAdminMemberListWhere(
            toListWhereParams(defaultDetailQuery)
          ),
          {
            OR: [
              { createdAt: { gt: CREATED_AT } },
              { createdAt: CREATED_AT, id: { gt: CUSTOMER_ID } },
            ],
          },
        ],
      });
      assert.deepEqual(neighborCalls[1]?.where, {
        AND: [
          adminMemberRepository.buildAdminMemberListWhere(
            toListWhereParams(defaultDetailQuery)
          ),
          {
            OR: [
              { createdAt: { lt: CREATED_AT } },
              { createdAt: CREATED_AT, id: { lt: CUSTOMER_ID } },
            ],
          },
        ],
      });
    });

    it('sort=ASC일 때 이전·다음 조회 조건과 정렬을 사용한다', async () => {
      const neighborCalls: Array<{
        where: Prisma.UserWhereInput;
        orderBy: Prisma.UserOrderByWithRelationInput[];
      }> = [];
      let callIndex = 0;

      mock.method(adminMemberRepository, 'findAdminMemberDetail', async () =>
        buildDetailRow()
      );
      mock.method(
        adminMemberRepository,
        'countAdminMemberReports',
        async () => 0
      );
      mock.method(
        adminMemberRepository,
        'findAdminMemberFirst',
        async (
          where: Prisma.UserWhereInput,
          orderBy: Prisma.UserOrderByWithRelationInput[]
        ) => {
          callIndex += 1;
          if (callIndex === 1) {
            return memberInFilter;
          }
          neighborCalls.push({ where, orderBy });
          return null;
        }
      );

      await getAdminMemberDetail(CUSTOMER_ID, {
        ...defaultDetailQuery,
        sort: 'ASC',
      });

      assert.deepEqual(neighborCalls[0]?.orderBy, [
        { createdAt: 'desc' },
        { id: 'asc' },
      ]);
      assert.deepEqual(neighborCalls[1]?.orderBy, [
        { createdAt: 'asc' },
        { id: 'desc' },
      ]);
      assert.deepEqual(neighborCalls[0]?.where, {
        AND: [
          adminMemberRepository.buildAdminMemberListWhere(
            toListWhereParams({ ...defaultDetailQuery, sort: 'ASC' })
          ),
          {
            OR: [
              { createdAt: { lt: CREATED_AT } },
              { createdAt: CREATED_AT, id: { gt: CUSTOMER_ID } },
            ],
          },
        ],
      });
      assert.deepEqual(neighborCalls[1]?.where, {
        AND: [
          adminMemberRepository.buildAdminMemberListWhere(
            toListWhereParams({ ...defaultDetailQuery, sort: 'ASC' })
          ),
          {
            OR: [
              { createdAt: { gt: CREATED_AT } },
              { createdAt: CREATED_AT, id: { lt: CUSTOMER_ID } },
            ],
          },
        ],
      });
    });

    it('createdAt이 같으면 id를 tie-breaker로 사용한다', async () => {
      const neighborCalls: Array<{
        where: Prisma.UserWhereInput;
        orderBy: Prisma.UserOrderByWithRelationInput[];
      }> = [];
      let callIndex = 0;

      mock.method(adminMemberRepository, 'findAdminMemberDetail', async () =>
        buildDetailRow()
      );
      mock.method(
        adminMemberRepository,
        'countAdminMemberReports',
        async () => 0
      );
      mock.method(
        adminMemberRepository,
        'findAdminMemberFirst',
        async (
          where: Prisma.UserWhereInput,
          orderBy: Prisma.UserOrderByWithRelationInput[]
        ) => {
          callIndex += 1;
          if (callIndex === 1) {
            return memberInFilter;
          }
          neighborCalls.push({ where, orderBy });
          return null;
        }
      );

      await getAdminMemberDetail(CUSTOMER_ID, defaultDetailQuery);

      const prevOr = (
        neighborCalls[0]?.where as { AND: Prisma.UserWhereInput[] }
      ).AND[1] as { OR: Prisma.UserWhereInput[] };
      assert.deepEqual(prevOr.OR[1], {
        createdAt: CREATED_AT,
        id: { gt: CUSTOMER_ID },
      });
      const nextOr = (
        neighborCalls[1]?.where as { AND: Prisma.UserWhereInput[] }
      ).AND[1] as { OR: Prisma.UserWhereInput[] };
      assert.deepEqual(nextOr.OR[1], {
        createdAt: CREATED_AT,
        id: { lt: CUSTOMER_ID },
      });
    });

    it('이전 회원만 있으면 prevId만 채운다', async () => {
      const responses: Array<{ id: string } | null> = [
        { id: CUSTOMER_ID },
        { id: PREV_ID },
        null,
      ];
      let responseIndex = 0;

      mock.method(adminMemberRepository, 'findAdminMemberDetail', async () =>
        buildDetailRow()
      );
      mock.method(
        adminMemberRepository,
        'countAdminMemberReports',
        async () => 0
      );
      mock.method(adminMemberRepository, 'findAdminMemberFirst', async () => {
        const response = responses[responseIndex];
        responseIndex += 1;
        return response ?? null;
      });

      const result = await getAdminMemberDetail(
        CUSTOMER_ID,
        defaultDetailQuery
      );

      assert.equal(result.prevId, PREV_ID);
      assert.equal(result.nextId, null);
    });

    it('다음 회원만 있으면 nextId만 채운다', async () => {
      const responses: Array<{ id: string } | null> = [
        { id: CUSTOMER_ID },
        null,
        { id: NEXT_ID },
      ];
      let responseIndex = 0;

      mock.method(adminMemberRepository, 'findAdminMemberDetail', async () =>
        buildDetailRow()
      );
      mock.method(
        adminMemberRepository,
        'countAdminMemberReports',
        async () => 0
      );
      mock.method(adminMemberRepository, 'findAdminMemberFirst', async () => {
        const response = responses[responseIndex];
        responseIndex += 1;
        return response ?? null;
      });

      const result = await getAdminMemberDetail(
        CUSTOMER_ID,
        defaultDetailQuery
      );

      assert.equal(result.prevId, null);
      assert.equal(result.nextId, NEXT_ID);
    });

    it('이전·다음 회원이 모두 없으면 둘 다 null이다', async () => {
      const responses: Array<{ id: string } | null> = [
        { id: CUSTOMER_ID },
        null,
        null,
      ];
      let responseIndex = 0;

      mock.method(adminMemberRepository, 'findAdminMemberDetail', async () =>
        buildDetailRow()
      );
      mock.method(
        adminMemberRepository,
        'countAdminMemberReports',
        async () => 0
      );
      mock.method(adminMemberRepository, 'findAdminMemberFirst', async () => {
        const response = responses[responseIndex];
        responseIndex += 1;
        return response ?? null;
      });

      const result = await getAdminMemberDetail(
        CUSTOMER_ID,
        defaultDetailQuery
      );

      assert.equal(result.prevId, null);
      assert.equal(result.nextId, null);
    });
  });
});

describe('suspendAdminMember', () => {
  beforeEach(() => {
    mock.timers.enable({ apis: ['Date'], now: FIXED_NOW });
  });

  afterEach(() => {
    mock.timers.reset();
    mock.restoreAll();
  });

  it('존재하지 않는 회원이면 ADMIN_MEMBER_NOT_FOUND를 던진다', async () => {
    mock.method(auditContext, 'runWithManualAudit', runManualAuditImmediately);
    mock.method(auditContext, 'runAuditedTransaction', runTxImmediately);
    mock.method(
      adminMemberRepository,
      'lockAdminMemberForStatusChange',
      async () => null
    );

    await assert.rejects(
      () => suspendAdminMember(CUSTOMER_ID, ADMIN_ID),
      assertMemberNotFound
    );
  });

  it('7일 정지 상태를 저장하고 History CREATE와 알림을 남긴다', async () => {
    let lockedMemberId: string | undefined;
    let upsertData: adminMemberRepository.AdminMemberStatusUpdate | undefined;
    let historyInput:
      Parameters<typeof historyRepository.createHistory>[0] | undefined;
    let notifyCalled = false;

    const afterStatus: AdminMemberStatusRow = {
      userId: CUSTOMER_ID,
      status: UserStatus.SUSPENDED,
      suspendedAt: FIXED_NOW,
      suspendedUntil: SUSPEND_UNTIL,
    };

    mock.method(auditContext, 'runWithManualAudit', runManualAuditImmediately);
    mock.method(auditContext, 'runAuditedTransaction', runTxImmediately);
    mock.method(
      adminMemberRepository,
      'lockAdminMemberForStatusChange',
      async (memberId: string) => {
        lockedMemberId = memberId;
        return { id: memberId };
      }
    );
    mock.method(
      adminMemberRepository,
      'findAdminMemberStatus',
      async () => null
    );
    mock.method(
      adminMemberRepository,
      'upsertAdminMemberStatus',
      async (
        _memberId: string,
        data: adminMemberRepository.AdminMemberStatusUpdate
      ) => {
        upsertData = data;
        return afterStatus;
      }
    );
    mock.method(
      historyRepository,
      'createHistory',
      async (data: Prisma.HistoryUncheckedCreateInput) => {
        historyInput = data;
        return { id: 1 };
      }
    );
    mock.method(
      notificationService,
      'notifySanction',
      async (params: NotifySanctionParams) => {
        notifyCalled = true;
        assert.deepEqual(params, { receiverId: CUSTOMER_ID });
        return {
          id: 1,
          receiverId: CUSTOMER_ID,
          type: 'SANCTION_NOTIFIED',
          payload: {},
          isRead: false,
          createdAt: FIXED_NOW,
        };
      }
    );

    const result = await suspendAdminMember(CUSTOMER_ID, ADMIN_ID);

    assert.equal(lockedMemberId, CUSTOMER_ID);
    assert.deepEqual(upsertData, {
      status: UserStatus.SUSPENDED,
      suspendedAt: FIXED_NOW,
      suspendedUntil: SUSPEND_UNTIL,
    });
    assert.deepEqual(result, {
      memberId: CUSTOMER_ID,
      status: UserStatus.SUSPENDED,
      suspendedAt: FIXED_NOW,
      suspendedUntil: SUSPEND_UNTIL,
    });
    assert.deepEqual(historyInput, {
      userId: null,
      adminUserId: ADMIN_ID,
      tableName: 'user_statuses',
      tableRowId: CUSTOMER_ID,
      operationType: HistoryAction.CREATE,
      beforeData: Prisma.DbNull,
      afterData: {
        userId: CUSTOMER_ID,
        status: UserStatus.SUSPENDED,
        suspendedAt: FIXED_NOW.toISOString(),
        suspendedUntil: SUSPEND_UNTIL.toISOString(),
      },
    });
    assert.equal(notifyCalled, true);
  });

  it('이미 정지된 회원도 정지 시각을 다시 저장하고 History UPDATE를 남긴다', async () => {
    const beforeStatus: AdminMemberStatusRow = {
      userId: CUSTOMER_ID,
      status: UserStatus.SUSPENDED,
      suspendedAt: SUSPENDED_AT,
      suspendedUntil: SUSPENDED_UNTIL,
    };
    let historyInput:
      Parameters<typeof historyRepository.createHistory>[0] | undefined;

    mock.method(auditContext, 'runWithManualAudit', runManualAuditImmediately);
    mock.method(auditContext, 'runAuditedTransaction', runTxImmediately);
    mock.method(
      adminMemberRepository,
      'lockAdminMemberForStatusChange',
      async () => ({ id: CUSTOMER_ID })
    );
    mock.method(
      adminMemberRepository,
      'findAdminMemberStatus',
      async () => beforeStatus
    );
    mock.method(adminMemberRepository, 'upsertAdminMemberStatus', async () => ({
      userId: CUSTOMER_ID,
      status: UserStatus.SUSPENDED,
      suspendedAt: FIXED_NOW,
      suspendedUntil: SUSPEND_UNTIL,
    }));
    mock.method(
      historyRepository,
      'createHistory',
      async (data: Prisma.HistoryUncheckedCreateInput) => {
        historyInput = data;
        return { id: 2 };
      }
    );
    mock.method(notificationService, 'notifySanction', async () => ({
      id: 1,
      receiverId: CUSTOMER_ID,
      type: 'SANCTION_NOTIFIED',
      payload: {},
      isRead: false,
      createdAt: FIXED_NOW,
    }));

    await suspendAdminMember(CUSTOMER_ID, ADMIN_ID);

    assert.equal(historyInput?.operationType, HistoryAction.UPDATE);
    assert.deepEqual(historyInput?.beforeData, {
      userId: CUSTOMER_ID,
      status: UserStatus.SUSPENDED,
      suspendedAt: SUSPENDED_AT.toISOString(),
      suspendedUntil: SUSPENDED_UNTIL.toISOString(),
    });
  });

  it('트랜잭션이 실패하면 알림을 보내지 않는다', async () => {
    let notifyCalled = false;

    mock.method(auditContext, 'runWithManualAudit', runManualAuditImmediately);
    mock.method(auditContext, 'runAuditedTransaction', async () => {
      throw new AppError('ADMIN_MEMBER_NOT_FOUND');
    });
    mock.method(notificationService, 'notifySanction', async () => {
      notifyCalled = true;
      return {
        id: 1,
        receiverId: CUSTOMER_ID,
        type: 'SANCTION_NOTIFIED',
        payload: {},
        isRead: false,
        createdAt: FIXED_NOW,
      };
    });

    await assert.rejects(
      () => suspendAdminMember(CUSTOMER_ID, ADMIN_ID),
      assertMemberNotFound
    );
    assert.equal(notifyCalled, false);
  });
});

describe('activateAdminMember', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('존재하지 않는 회원이면 ADMIN_MEMBER_NOT_FOUND를 던진다', async () => {
    mock.method(auditContext, 'runWithManualAudit', runManualAuditImmediately);
    mock.method(auditContext, 'runAuditedTransaction', runTxImmediately);
    mock.method(
      adminMemberRepository,
      'lockAdminMemberForStatusChange',
      async () => null
    );

    await assert.rejects(
      () => activateAdminMember(CUSTOMER_ID, ADMIN_ID),
      assertMemberNotFound
    );
  });

  it('정지 회원을 ACTIVE로 바꾸고 정지 시각을 null로 저장한다', async () => {
    let upsertData: adminMemberRepository.AdminMemberStatusUpdate | undefined;
    let historyInput:
      Parameters<typeof historyRepository.createHistory>[0] | undefined;
    let notifyCalled = false;

    const beforeStatus: AdminMemberStatusRow = {
      userId: CUSTOMER_ID,
      status: UserStatus.SUSPENDED,
      suspendedAt: SUSPENDED_AT,
      suspendedUntil: SUSPENDED_UNTIL,
    };

    mock.method(auditContext, 'runWithManualAudit', runManualAuditImmediately);
    mock.method(auditContext, 'runAuditedTransaction', runTxImmediately);
    mock.method(
      adminMemberRepository,
      'lockAdminMemberForStatusChange',
      async () => ({ id: CUSTOMER_ID })
    );
    mock.method(
      adminMemberRepository,
      'findAdminMemberStatus',
      async () => beforeStatus
    );
    mock.method(
      adminMemberRepository,
      'upsertAdminMemberStatus',
      async (
        _memberId: string,
        data: adminMemberRepository.AdminMemberStatusUpdate
      ) => {
        upsertData = data;
        return {
          userId: CUSTOMER_ID,
          status: UserStatus.ACTIVE,
          suspendedAt: null,
          suspendedUntil: null,
        };
      }
    );
    mock.method(
      historyRepository,
      'createHistory',
      async (data: Prisma.HistoryUncheckedCreateInput) => {
        historyInput = data;
        return { id: 3 };
      }
    );
    mock.method(notificationService, 'notifySanction', async () => {
      notifyCalled = true;
      return {
        id: 1,
        receiverId: CUSTOMER_ID,
        type: 'SANCTION_NOTIFIED',
        payload: {},
        isRead: false,
        createdAt: FIXED_NOW,
      };
    });

    const result = await activateAdminMember(CUSTOMER_ID, ADMIN_ID);

    assert.deepEqual(upsertData, {
      status: UserStatus.ACTIVE,
      suspendedAt: null,
      suspendedUntil: null,
    });
    assert.deepEqual(result, {
      memberId: CUSTOMER_ID,
      status: UserStatus.ACTIVE,
      suspendedAt: null,
      suspendedUntil: null,
    });
    assert.equal(historyInput?.operationType, HistoryAction.UPDATE);
    assert.equal(historyInput?.tableName, 'user_statuses');
    assert.equal(notifyCalled, false);
  });

  it('이미 ACTIVE인 회원도 동일한 활성화 값으로 upsert한다', async () => {
    let upsertData: adminMemberRepository.AdminMemberStatusUpdate | undefined;

    mock.method(auditContext, 'runWithManualAudit', runManualAuditImmediately);
    mock.method(auditContext, 'runAuditedTransaction', runTxImmediately);
    mock.method(
      adminMemberRepository,
      'lockAdminMemberForStatusChange',
      async () => ({ id: CUSTOMER_ID })
    );
    mock.method(adminMemberRepository, 'findAdminMemberStatus', async () => ({
      userId: CUSTOMER_ID,
      status: UserStatus.ACTIVE,
      suspendedAt: null,
      suspendedUntil: null,
    }));
    mock.method(
      adminMemberRepository,
      'upsertAdminMemberStatus',
      async (
        _memberId: string,
        data: adminMemberRepository.AdminMemberStatusUpdate
      ) => {
        upsertData = data;
        return {
          userId: CUSTOMER_ID,
          status: UserStatus.ACTIVE,
          suspendedAt: null,
          suspendedUntil: null,
        };
      }
    );
    mock.method(historyRepository, 'createHistory', async () => ({ id: 4 }));

    await activateAdminMember(CUSTOMER_ID, ADMIN_ID);

    assert.deepEqual(upsertData, {
      status: UserStatus.ACTIVE,
      suspendedAt: null,
      suspendedUntil: null,
    });
  });

  it('트랜잭션이 실패하면 알림을 보내지 않는다', async () => {
    let notifyCalled = false;

    mock.method(auditContext, 'runWithManualAudit', runManualAuditImmediately);
    mock.method(auditContext, 'runAuditedTransaction', async () => {
      throw new AppError('ADMIN_MEMBER_NOT_FOUND');
    });
    mock.method(notificationService, 'notifySanction', async () => {
      notifyCalled = true;
      return {
        id: 1,
        receiverId: CUSTOMER_ID,
        type: 'SANCTION_NOTIFIED',
        payload: {},
        isRead: false,
        createdAt: FIXED_NOW,
      };
    });

    await assert.rejects(
      () => activateAdminMember(CUSTOMER_ID, ADMIN_ID),
      assertMemberNotFound
    );
    assert.equal(notifyCalled, false);
  });
});
