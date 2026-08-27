import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import {
  HistoryAction,
  MessageType,
  MoveType,
  PostsCategory,
  Prisma,
  Region,
  UserReportCategory,
  UserReportStatus,
  UserReportTarget,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as auditContext from '../lib/audit-context';
import * as adminMemberRepository from '../repositories/admin-member.repository';
import type {
  AdminReportDetailRow,
  AdminReportListRow,
  AdminReportLockRow,
} from '../repositories/admin-report.repository';
import * as adminReportRepository from '../repositories/admin-report.repository';
import * as historyRepository from '../repositories/history.repository';
import * as userStatusRepository from '../repositories/user-status.repository';
import type {
  AdminReportDetailQuery,
  AdminReportListQuery,
} from '../schemas/admin-report.schema';
import { createDateRange } from '../utils/admin-date-range.util';
import { AppError } from '../utils/app.error';
import {
  getAdminReportDetail,
  getAdminReportList,
  getReportStatistics,
  rejectAdminReport,
  resolveAdminReport,
} from './admin-report.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID_2 = '22222222-2222-4222-8222-222222222222';
const ADMIN_ID = 7;
const REPORT_ID = 10;
const FIXED_NOW = new Date('2026-08-26T12:00:00.000Z');
const SUSPEND_UNTIL = new Date(FIXED_NOW.getTime() + 7 * 24 * 60 * 60 * 1000);
const CREATED_AT = new Date('2026-08-15T00:00:00.000Z');
const AUG_01 = new Date('2026-08-01T00:00:00.000Z');
const AUG_26 = new Date('2026-08-26T00:00:00.000Z');

const defaultListQuery: AdminReportListQuery = {
  page: 1,
  pageSize: 10,
  sort: 'DESC',
};

const defaultDetailQuery: AdminReportDetailQuery = {
  sort: 'DESC',
};

const PREV_REPORT_ID = 9;
const NEXT_REPORT_ID = 11;
const SENDER_ID = '33333333-3333-4333-8333-333333333333';

const mockTx = { id: 'tx-1' };

const assertAppError =
  (code: string) =>
  (error: unknown): boolean => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, code);
    return true;
  };

const runManualAuditImmediately = async <T>(fn: () => Promise<T>) => fn();

const runTxImmediately = async <T>(
  fn: (tx: typeof mockTx) => Promise<T>
): Promise<T> => fn(mockTx);

const setupAuditTxMocks = () => {
  mock.method(auditContext, 'runWithManualAudit', runManualAuditImmediately);
  mock.method(auditContext, 'runAuditedTransaction', runTxImmediately);
};

const setupUserTargetDetailMocks = () => {
  mock.method(adminReportRepository, 'findAdminReportById', async () =>
    buildDetailRow()
  );
  mock.method(
    adminReportRepository,
    'findReportDetailTargetUserById',
    async () => null
  );
  mock.method(
    adminReportRepository,
    'findReportDetailSanctionTargetUser',
    async () => ({ kind: 'not_found' })
  );
  mock.method(adminReportRepository, 'findReportedUserProfile', async () => ({
    kind: 'not_found',
  }));
};

const mockNeighborResponses = (responses: Array<{ id: number } | null>) => {
  let responseIndex = 0;
  mock.method(adminReportRepository, 'findAdminReportFirst', async () => {
    const response = responses[responseIndex];
    responseIndex += 1;
    return response ?? null;
  });
};

const buildReporter = (
  overrides: Partial<AdminReportListRow['reporter']> = {}
): AdminReportListRow['reporter'] => ({
  id: USER_ID_2,
  name: '신고자',
  nickname: 'reporter',
  email: 'reporter@example.com',
  userType: UserType.CUSTOMER,
  ...overrides,
});

const buildListRow = (
  overrides: Partial<AdminReportListRow> = {}
): AdminReportListRow => ({
  id: REPORT_ID,
  reporterId: USER_ID_2,
  target: UserReportTarget.USER,
  targetId: USER_ID,
  category: UserReportCategory.INAPPROPRIATE_PROFILE,
  status: UserReportStatus.PENDING,
  createdAt: CREATED_AT,
  reporter: buildReporter(),
  ...overrides,
});

const buildDetailRow = (
  overrides: Partial<AdminReportDetailRow> = {}
): AdminReportDetailRow => ({
  id: REPORT_ID,
  reporterId: USER_ID_2,
  target: UserReportTarget.USER,
  targetId: USER_ID,
  category: UserReportCategory.INAPPROPRIATE_PROFILE,
  status: UserReportStatus.PENDING,
  adminId: null,
  createdAt: CREATED_AT,
  reporter: {
    id: USER_ID_2,
    name: '신고자',
    nickname: 'reporter',
    email: 'reporter@example.com',
    userType: UserType.CUSTOMER,
    deletedAt: null,
    profileImageKey: null,
  },
  admin: null,
  ...overrides,
});

const buildPendingLockRow = (
  overrides: Partial<AdminReportLockRow> = {}
): AdminReportLockRow => ({
  id: REPORT_ID,
  target: UserReportTarget.USER,
  targetId: USER_ID,
  status: UserReportStatus.PENDING,
  adminId: null,
  ...overrides,
});

const sanctionUserRow = {
  id: USER_ID,
  name: '대상',
  nickname: 'target',
  profileImageKey: null,
  deletedAt: null,
  userStatus: null,
};

describe('getReportStatistics', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('전체·상태별 집계를 응답 필드에 매핑한다', async () => {
    const receivedWheres: Prisma.UserReportWhereInput[] = [];
    mock.method(
      adminReportRepository,
      'getTotalReportCount',
      async (where: Prisma.UserReportWhereInput) => {
        receivedWheres.push(where);
        const counts = [100, 40, 30, 30];
        return counts[receivedWheres.length - 1] ?? 0;
      }
    );

    const result = await getReportStatistics({});

    assert.deepEqual(result, {
      totalReportCount: 100,
      pendingReportCount: 40,
      resolvedReportCount: 30,
      rejectedReportCount: 30,
    });
    assert.deepEqual(receivedWheres[0], {});
    assert.deepEqual(receivedWheres[1], {
      status: UserReportStatus.PENDING,
    });
    assert.deepEqual(receivedWheres[2], {
      status: UserReportStatus.RESOLVED,
    });
    assert.deepEqual(receivedWheres[3], {
      status: UserReportStatus.REJECTED,
    });
  });

  it('startDate와 endDate가 있으면 네 집계 모두 같은 createdAt 범위를 사용한다', async () => {
    const receivedWheres: Prisma.UserReportWhereInput[] = [];
    mock.method(
      adminReportRepository,
      'getTotalReportCount',
      async (where: Prisma.UserReportWhereInput) => {
        receivedWheres.push(where);
        return 1;
      }
    );

    await getReportStatistics({ startDate: AUG_01, endDate: AUG_26 });

    const dateRange = createDateRange(AUG_01, AUG_26);
    assert.equal(receivedWheres.length, 4);
    for (const where of receivedWheres) {
      assert.deepEqual(where.createdAt, dateRange);
    }
  });
});

describe('getAdminReportList', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('목록 query와 targetIds를 Repository에 전달하고 페이지네이션을 계산한다', async () => {
    let receivedParams: AdminReportListQuery | undefined;
    let receivedTargetIds:
      adminReportRepository.AdminReportTargetIdsByKeyword | undefined;

    mock.method(
      adminReportRepository,
      'findReportTargetIdsByTargetUserKeyword',
      async () => ({
        userIds: [USER_ID],
        reviewIds: [],
        messageIds: [],
        articleIds: [],
        commentIds: [],
      })
    );
    mock.method(
      adminReportRepository,
      'findAdminReportsWithCount',
      async (
        params: AdminReportListQuery,
        targetIds?: adminReportRepository.AdminReportTargetIdsByKeyword
      ) => {
        receivedParams = params;
        receivedTargetIds = targetIds;
        return { items: [], totalCount: 21 };
      }
    );
    mock.method(
      adminReportRepository,
      'findReportTargetUsersByIds',
      async () => []
    );
    mock.method(
      adminReportRepository,
      'findReportTargetReviewsByIds',
      async () => []
    );
    mock.method(
      adminReportRepository,
      'findReportTargetMessagesByIds',
      async () => []
    );
    mock.method(
      adminReportRepository,
      'findReportTargetArticlesByIds',
      async () => []
    );
    mock.method(
      adminReportRepository,
      'findReportTargetCommentsByIds',
      async () => []
    );

    const params: AdminReportListQuery = {
      page: 2,
      pageSize: 10,
      sort: 'DESC',
      userName: '홍길동',
    };
    const result = await getAdminReportList(params);

    assert.deepEqual(receivedParams, params);
    assert.deepEqual(receivedTargetIds, {
      userIds: [USER_ID],
      reviewIds: [],
      messageIds: [],
      articleIds: [],
      commentIds: [],
    });
    assert.deepEqual(result.pagination, {
      page: 2,
      pageSize: 10,
      totalCount: 21,
      totalPages: 3,
    });
  });

  it('totalCount가 0이면 totalPages도 0이다', async () => {
    mock.method(
      adminReportRepository,
      'findAdminReportsWithCount',
      async () => ({ items: [], totalCount: 0 })
    );
    mock.method(
      adminReportRepository,
      'findReportTargetUsersByIds',
      async () => []
    );
    mock.method(
      adminReportRepository,
      'findReportTargetReviewsByIds',
      async () => []
    );
    mock.method(
      adminReportRepository,
      'findReportTargetMessagesByIds',
      async () => []
    );
    mock.method(
      adminReportRepository,
      'findReportTargetArticlesByIds',
      async () => []
    );
    mock.method(
      adminReportRepository,
      'findReportTargetCommentsByIds',
      async () => []
    );

    const result = await getAdminReportList(defaultListQuery);

    assert.equal(result.pagination.totalPages, 0);
  });

  it('대상별 배치 조회에 정규화된 ID만 전달하고 DTO를 매핑한다', async () => {
    let userIds: string[] | undefined;
    let reviewIds: number[] | undefined;
    let messageIds: number[] | undefined;
    let articleIds: number[] | undefined;
    let commentIds: number[] | undefined;

    mock.method(
      adminReportRepository,
      'findAdminReportsWithCount',
      async () => ({
        items: [
          buildListRow({
            id: 1,
            target: UserReportTarget.USER,
            targetId: USER_ID,
          }),
          buildListRow({
            id: 2,
            target: UserReportTarget.REVIEW,
            targetId: '10',
          }),
          buildListRow({
            id: 3,
            target: UserReportTarget.MESSAGE,
            targetId: '20',
          }),
          buildListRow({
            id: 4,
            target: UserReportTarget.ARTICLE,
            targetId: '30',
          }),
          buildListRow({
            id: 5,
            target: UserReportTarget.COMMENT,
            targetId: '40',
          }),
          buildListRow({
            id: 6,
            target: UserReportTarget.REVIEW,
            targetId: 'invalid',
          }),
        ],
        totalCount: 6,
      })
    );
    mock.method(
      adminReportRepository,
      'findReportTargetUsersByIds',
      async (ids: string[]) => {
        userIds = ids;
        return [
          {
            id: USER_ID,
            name: '홍길동',
            nickname: 'hong',
            email: 'hong@example.com',
            userType: UserType.CUSTOMER,
          },
        ];
      }
    );
    mock.method(
      adminReportRepository,
      'findReportTargetReviewsByIds',
      async (ids: number[]) => {
        reviewIds = ids;
        return [
          {
            id: 10,
            rating: 5,
            content: '리뷰',
            user: { id: USER_ID, name: '작성자', nickname: 'author' },
          },
        ];
      }
    );
    mock.method(
      adminReportRepository,
      'findReportTargetMessagesByIds',
      async (ids: number[]) => {
        messageIds = ids;
        return [
          {
            id: 20,
            content: '메시지',
            messageType: MessageType.TEXT,
            sender: { id: USER_ID, name: '발신', nickname: 'sender' },
          },
        ];
      }
    );
    mock.method(
      adminReportRepository,
      'findReportTargetArticlesByIds',
      async (ids: number[]) => {
        articleIds = ids;
        return [
          {
            id: 30,
            title: '게시글',
            category: PostsCategory.MOVING_TIP,
            user: { id: USER_ID, name: '작성', nickname: 'writer' },
          },
        ];
      }
    );
    mock.method(
      adminReportRepository,
      'findReportTargetCommentsByIds',
      async (ids: number[]) => {
        commentIds = ids;
        return [
          {
            id: 40,
            content: '댓글',
            user: null,
          },
        ];
      }
    );

    const result = await getAdminReportList(defaultListQuery);

    assert.deepEqual(userIds, [USER_ID]);
    assert.deepEqual(reviewIds, [10]);
    assert.deepEqual(messageIds, [20]);
    assert.deepEqual(articleIds, [30]);
    assert.deepEqual(commentIds, [40]);
    assert.deepEqual(result.items[0]?.targetInfo, {
      type: 'USER',
      id: USER_ID,
      name: '홍길동',
      nickname: 'hong',
      email: 'hong@example.com',
      userType: UserType.CUSTOMER,
    });
    assert.deepEqual(result.items[1]?.targetInfo, {
      type: 'REVIEW',
      id: 10,
      rating: 5,
      content: '리뷰',
      author: { id: USER_ID, name: '작성자', nickname: 'author' },
    });
    assert.deepEqual(result.items[2]?.targetInfo?.type, 'MESSAGE');
    assert.deepEqual(result.items[3]?.targetInfo?.type, 'ARTICLE');
    assert.deepEqual(result.items[4]?.targetInfo, {
      type: 'COMMENT',
      id: 40,
      content: '댓글',
      author: null,
    });
    assert.equal(result.items[5]?.targetInfo, null);
  });

  it('중복 numeric targetId는 배치 조회에서 제거하고 Map key로 연결한다', async () => {
    let reviewIdsReceived: number[] | undefined;
    mock.method(
      adminReportRepository,
      'findAdminReportsWithCount',
      async () => ({
        items: [
          buildListRow({
            target: UserReportTarget.REVIEW,
            targetId: '10',
          }),
          buildListRow({
            id: 11,
            target: UserReportTarget.REVIEW,
            targetId: '10',
          }),
        ],
        totalCount: 2,
      })
    );
    mock.method(
      adminReportRepository,
      'findReportTargetUsersByIds',
      async () => []
    );
    mock.method(
      adminReportRepository,
      'findReportTargetReviewsByIds',
      async (ids: number[]) => {
        reviewIdsReceived = ids;
        return [
          {
            id: 10,
            rating: 4,
            content: '리뷰',
            user: null,
          },
        ];
      }
    );
    mock.method(
      adminReportRepository,
      'findReportTargetMessagesByIds',
      async () => []
    );
    mock.method(
      adminReportRepository,
      'findReportTargetArticlesByIds',
      async () => []
    );
    mock.method(
      adminReportRepository,
      'findReportTargetCommentsByIds',
      async () => []
    );

    const result = await getAdminReportList(defaultListQuery);

    assert.deepEqual(reviewIdsReceived, [10]);
    assert.equal(result.items[0]?.targetInfo?.type, 'REVIEW');
    assert.equal(result.items[1]?.targetInfo?.type, 'REVIEW');
  });

  it('userName 검색 결과가 없으면 빈 목록을 반환한다', async () => {
    mock.method(
      adminReportRepository,
      'findReportTargetIdsByTargetUserKeyword',
      async (keyword: string) => {
        assert.equal(keyword, '없는사용자');
        return {
          userIds: [],
          reviewIds: [],
          messageIds: [],
          articleIds: [],
          commentIds: [],
        };
      }
    );
    mock.method(
      adminReportRepository,
      'findAdminReportsWithCount',
      async (
        _params: AdminReportListQuery,
        targetIds?: adminReportRepository.AdminReportTargetIdsByKeyword
      ) => {
        assert.deepEqual(targetIds, {
          userIds: [],
          reviewIds: [],
          messageIds: [],
          articleIds: [],
          commentIds: [],
        });
        return { items: [], totalCount: 0 };
      }
    );
    mock.method(
      adminReportRepository,
      'findReportTargetUsersByIds',
      async () => []
    );
    mock.method(
      adminReportRepository,
      'findReportTargetReviewsByIds',
      async () => []
    );
    mock.method(
      adminReportRepository,
      'findReportTargetMessagesByIds',
      async () => []
    );
    mock.method(
      adminReportRepository,
      'findReportTargetArticlesByIds',
      async () => []
    );
    mock.method(
      adminReportRepository,
      'findReportTargetCommentsByIds',
      async () => []
    );

    const result = await getAdminReportList({
      ...defaultListQuery,
      userName: '없는사용자',
    });

    assert.deepEqual(result.items, []);
    assert.equal(result.pagination.totalCount, 0);
  });
});

describe('getAdminReportDetail', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('신고가 없으면 ADMIN_REPORT_NOT_FOUND를 던진다', async () => {
    mock.method(adminReportRepository, 'findAdminReportById', async () => null);

    await assert.rejects(
      () => getAdminReportDetail(99, defaultDetailQuery),
      assertAppError('ADMIN_REPORT_NOT_FOUND')
    );
  });

  it('지원하지 않는 target이면 ADMIN_REPORT_UNSUPPORTED_TARGET을 던진다', async () => {
    mock.method(adminReportRepository, 'findAdminReportById', async () =>
      buildDetailRow({
        target: 'LEGACY' as UserReportTarget,
      })
    );

    await assert.rejects(
      () => getAdminReportDetail(REPORT_ID, defaultDetailQuery),
      assertAppError('ADMIN_REPORT_UNSUPPORTED_TARGET')
    );
  });

  it('USER 상세를 조회하고 CUSTOMER 프로필과 availableActions를 반환한다', async () => {
    mock.method(adminReportRepository, 'findAdminReportById', async () =>
      buildDetailRow({ target: UserReportTarget.USER, targetId: USER_ID })
    );
    mock.method(
      adminReportRepository,
      'findReportDetailTargetUserById',
      async (id: string) => {
        assert.equal(id, USER_ID);
        return {
          id: USER_ID,
          name: '홍길동',
          nickname: 'hong',
          email: 'hong@example.com',
          userType: UserType.CUSTOMER,
          deletedAt: null,
          createdAt: CREATED_AT,
          profileImageKey: 'profile/key',
          customerProfile: {
            region: Region.SEOUL,
            service: [MoveType.SMALL],
          },
          moverProfile: null,
        };
      }
    );
    mock.method(
      adminReportRepository,
      'findReportDetailSanctionTargetUser',
      async () => ({
        kind: 'found',
        user: { ...sanctionUserRow, reportCount: 3 },
      })
    );
    mock.method(adminReportRepository, 'findReportedUserProfile', async () => ({
      kind: 'customer_profile',
      profile: {
        id: USER_ID,
        name: '홍길동',
        nickname: 'hong',
        profileImageKey: 'profile/key',
        userType: UserType.CUSTOMER,
        deletedAt: null,
        createdAt: CREATED_AT,
        email: 'hong@example.com',
        customerProfile: {
          region: Region.SEOUL,
          service: [MoveType.SMALL],
        },
        moverProfile: null,
      },
    }));
    mock.method(adminReportRepository, 'findAdminReportFirst', async () => ({
      id: REPORT_ID,
    }));

    const result = await getAdminReportDetail(REPORT_ID, defaultDetailQuery);

    assert.equal(result.targetInfo.type, 'USER');
    assert.equal(
      result.targetInfo.user?.profile?.customer?.region,
      Region.SEOUL
    );
    assert.equal(result.targetInfo.user?.profile?.mover, null);
    assert.equal(result.reportedContent?.type, 'USER');
    assert.equal(
      result.reportedContent &&
        'userType' in result.reportedContent &&
        result.reportedContent.userType === 'CUSTOMER'
        ? result.reportedContent.region
        : null,
      Region.SEOUL
    );
    assert.deepEqual(result.availableActions, {
      canSuspendUser: true,
      canDeleteContent: false,
    });
    assert.equal(result.targetUser?.reportCount, 3);
  });

  it('REVIEW 상세는 review 전용 Repository만 호출한다', async () => {
    let reviewDetailCalled = false;
    let userDetailCalled = false;

    mock.method(adminReportRepository, 'findAdminReportById', async () =>
      buildDetailRow({
        target: UserReportTarget.REVIEW,
        targetId: '15',
      })
    );
    mock.method(
      adminReportRepository,
      'findReportDetailTargetReviewById',
      async (id: number) => {
        reviewDetailCalled = true;
        assert.equal(id, 15);
        return {
          id: 15,
          rating: 4,
          content: '리뷰 내용',
          createdAt: CREATED_AT,
          deletedAt: null,
          user: {
            id: USER_ID,
            name: '작성자',
            nickname: 'author',
            email: 'author@example.com',
            userType: UserType.MOVER,
            deletedAt: null,
            profileImageKey: null,
          },
        };
      }
    );
    mock.method(
      adminReportRepository,
      'findReportDetailTargetUserById',
      async () => {
        userDetailCalled = true;
        return null;
      }
    );
    mock.method(
      adminReportRepository,
      'findReportDetailSanctionTargetUser',
      async () => ({
        kind: 'found',
        user: { ...sanctionUserRow, reportCount: 1 },
      })
    );
    mock.method(
      adminReportRepository,
      'findReportReportedContent',
      async () => ({
        kind: 'review',
        content: {
          id: 15,
          userId: USER_ID,
          rating: 4,
          content: '리뷰 내용',
          createdAt: CREATED_AT,
          updatedAt: CREATED_AT,
          deletedAt: null,
        },
      })
    );
    mock.method(adminReportRepository, 'findAdminReportFirst', async () => ({
      id: REPORT_ID,
    }));

    const result = await getAdminReportDetail(REPORT_ID, defaultDetailQuery);

    assert.equal(reviewDetailCalled, true);
    assert.equal(userDetailCalled, false);
    assert.equal(result.targetInfo.type, 'REVIEW');
    assert.deepEqual(result.availableActions, {
      canSuspendUser: true,
      canDeleteContent: true,
    });
  });

  it('이미 삭제된 REVIEW는 canDeleteContent가 false다', async () => {
    mock.method(adminReportRepository, 'findAdminReportById', async () =>
      buildDetailRow({
        target: UserReportTarget.REVIEW,
        targetId: '15',
      })
    );
    mock.method(
      adminReportRepository,
      'findReportDetailTargetReviewById',
      async () => ({
        id: 15,
        rating: 4,
        content: '삭제됨',
        createdAt: CREATED_AT,
        deletedAt: CREATED_AT,
        user: null,
      })
    );
    mock.method(
      adminReportRepository,
      'findReportDetailSanctionTargetUser',
      async () => ({ kind: 'not_found' })
    );
    mock.method(
      adminReportRepository,
      'findReportReportedContent',
      async () => ({
        kind: 'review',
        content: {
          id: 15,
          userId: USER_ID,
          rating: 4,
          content: '삭제됨',
          createdAt: CREATED_AT,
          updatedAt: CREATED_AT,
          deletedAt: CREATED_AT,
        },
      })
    );
    mock.method(adminReportRepository, 'findAdminReportFirst', async () => ({
      id: REPORT_ID,
    }));

    const result = await getAdminReportDetail(REPORT_ID, defaultDetailQuery);

    assert.deepEqual(result.availableActions, {
      canSuspendUser: false,
      canDeleteContent: false,
    });
  });

  it('현재 신고가 목록 필터 밖이면 prevId와 nextId가 null이다', async () => {
    mock.method(adminReportRepository, 'findAdminReportById', async () =>
      buildDetailRow()
    );
    mock.method(
      adminReportRepository,
      'findReportDetailTargetUserById',
      async () => null
    );
    mock.method(
      adminReportRepository,
      'findReportDetailSanctionTargetUser',
      async () => ({ kind: 'not_found' })
    );
    mock.method(adminReportRepository, 'findReportedUserProfile', async () => ({
      kind: 'not_found',
    }));
    mock.method(
      adminReportRepository,
      'findAdminReportFirst',
      async () => null
    );

    const result = await getAdminReportDetail(REPORT_ID, defaultDetailQuery);

    assert.equal(result.prevId, null);
    assert.equal(result.nextId, null);
  });

  it('sort=DESC일 때 이전·다음 where와 정렬을 사용한다', async () => {
    const neighborCalls: Array<{
      where: Prisma.UserReportWhereInput;
      orderBy: Prisma.UserReportOrderByWithRelationInput[];
    }> = [];
    let callIndex = 0;

    mock.method(adminReportRepository, 'findAdminReportById', async () =>
      buildDetailRow()
    );
    mock.method(
      adminReportRepository,
      'findReportDetailTargetUserById',
      async () => null
    );
    mock.method(
      adminReportRepository,
      'findReportDetailSanctionTargetUser',
      async () => ({ kind: 'not_found' })
    );
    mock.method(adminReportRepository, 'findReportedUserProfile', async () => ({
      kind: 'not_found',
    }));
    mock.method(
      adminReportRepository,
      'findAdminReportFirst',
      async (
        where: Prisma.UserReportWhereInput,
        orderBy: Prisma.UserReportOrderByWithRelationInput[]
      ) => {
        callIndex += 1;
        if (callIndex === 1) {
          return { id: REPORT_ID };
        }
        neighborCalls.push({ where, orderBy });
        return null;
      }
    );

    await getAdminReportDetail(REPORT_ID, defaultDetailQuery);

    assert.deepEqual(neighborCalls[0]?.orderBy, [
      { createdAt: 'asc' },
      { id: 'asc' },
    ]);
    assert.deepEqual(neighborCalls[1]?.orderBy, [
      { createdAt: 'desc' },
      { id: 'desc' },
    ]);
  });

  it('MESSAGE 상세는 message 전용 Repository만 호출하고 DTO를 매핑한다', async () => {
    const callFlags = {
      message: false,
      review: false,
      article: false,
      comment: false,
      user: false,
    };

    mock.method(adminReportRepository, 'findAdminReportById', async () =>
      buildDetailRow({
        target: UserReportTarget.MESSAGE,
        targetId: '25',
      })
    );
    mock.method(
      adminReportRepository,
      'findReportDetailTargetMessageById',
      async (id: number) => {
        callFlags.message = true;
        assert.equal(id, 25);
        return {
          id: 25,
          content: '채팅 내용',
          messageType: MessageType.TEXT,
          roomId: 100,
          createdAt: CREATED_AT,
          sender: {
            id: SENDER_ID,
            name: '발신자',
            nickname: 'sender',
            email: 'sender@example.com',
            userType: UserType.MOVER,
            deletedAt: null,
            profileImageKey: null,
          },
        };
      }
    );
    mock.method(
      adminReportRepository,
      'findReportDetailTargetReviewById',
      async () => {
        callFlags.review = true;
        return null;
      }
    );
    mock.method(
      adminReportRepository,
      'findReportDetailTargetArticleById',
      async () => {
        callFlags.article = true;
        return null;
      }
    );
    mock.method(
      adminReportRepository,
      'findReportDetailTargetCommentById',
      async () => {
        callFlags.comment = true;
        return null;
      }
    );
    mock.method(
      adminReportRepository,
      'findReportDetailTargetUserById',
      async () => {
        callFlags.user = true;
        return null;
      }
    );
    mock.method(
      adminReportRepository,
      'findReportDetailSanctionTargetUser',
      async (target: UserReportTarget, targetId: string) => {
        assert.equal(target, UserReportTarget.MESSAGE);
        assert.equal(targetId, '25');
        return {
          kind: 'found',
          user: {
            ...sanctionUserRow,
            id: SENDER_ID,
            reportCount: 2,
          },
        };
      }
    );
    mock.method(
      adminReportRepository,
      'findReportReportedContent',
      async () => ({
        kind: 'message',
        content: {
          id: 25,
          roomId: 100,
          messageType: MessageType.TEXT,
          content: '채팅 내용',
          isFiltered: false,
          createdAt: CREATED_AT,
        },
      })
    );
    mock.method(adminReportRepository, 'findAdminReportFirst', async () => ({
      id: REPORT_ID,
    }));

    const result = await getAdminReportDetail(REPORT_ID, defaultDetailQuery);

    assert.equal(callFlags.message, true);
    assert.equal(callFlags.review, false);
    assert.equal(callFlags.article, false);
    assert.equal(callFlags.comment, false);
    assert.equal(callFlags.user, false);
    assert.equal(result.targetInfo.type, 'MESSAGE');
    assert.equal(result.targetInfo.user?.id, SENDER_ID);
    assert.equal(result.content?.type, 'MESSAGE');
    assert.equal(result.content?.body, '채팅 내용');
    assert.equal(
      result.reportedContent?.type === 'MESSAGE'
        ? result.reportedContent.messageType
        : null,
      MessageType.TEXT
    );
    assert.equal(result.targetUser?.id, SENDER_ID);
    assert.deepEqual(result.availableActions, {
      canSuspendUser: true,
      canDeleteContent: false,
    });
  });

  it('ARTICLE 상세는 article 전용 Repository만 호출하고 DTO를 매핑한다', async () => {
    const callFlags = {
      message: false,
      review: false,
      article: false,
      comment: false,
      user: false,
    };

    mock.method(adminReportRepository, 'findAdminReportById', async () =>
      buildDetailRow({
        target: UserReportTarget.ARTICLE,
        targetId: '30',
      })
    );
    mock.method(
      adminReportRepository,
      'findReportDetailTargetArticleById',
      async (id: number) => {
        callFlags.article = true;
        assert.equal(id, 30);
        return {
          id: 30,
          title: '게시글 제목',
          content: '게시글 본문',
          category: PostsCategory.MOVING_TIP,
          createdAt: CREATED_AT,
          deletedAt: null,
          user: {
            id: USER_ID,
            name: '작성자',
            nickname: 'writer',
            email: 'writer@example.com',
            userType: UserType.CUSTOMER,
            deletedAt: null,
            profileImageKey: null,
          },
        };
      }
    );
    mock.method(
      adminReportRepository,
      'findReportDetailTargetMessageById',
      async () => {
        callFlags.message = true;
        return null;
      }
    );
    mock.method(
      adminReportRepository,
      'findReportDetailTargetReviewById',
      async () => {
        callFlags.review = true;
        return null;
      }
    );
    mock.method(
      adminReportRepository,
      'findReportDetailTargetCommentById',
      async () => {
        callFlags.comment = true;
        return null;
      }
    );
    mock.method(
      adminReportRepository,
      'findReportDetailTargetUserById',
      async () => {
        callFlags.user = true;
        return null;
      }
    );
    mock.method(
      adminReportRepository,
      'findReportDetailSanctionTargetUser',
      async () => ({
        kind: 'found',
        user: { ...sanctionUserRow, reportCount: 1 },
      })
    );
    mock.method(
      adminReportRepository,
      'findReportReportedContent',
      async () => ({
        kind: 'article',
        content: {
          id: 30,
          userId: USER_ID,
          category: PostsCategory.MOVING_TIP,
          title: '게시글 제목',
          content: '게시글 본문',
          createdAt: CREATED_AT,
          updatedAt: CREATED_AT,
          deletedAt: null,
        },
      })
    );
    mock.method(adminReportRepository, 'findAdminReportFirst', async () => ({
      id: REPORT_ID,
    }));

    const result = await getAdminReportDetail(REPORT_ID, defaultDetailQuery);

    assert.equal(callFlags.article, true);
    assert.equal(callFlags.message, false);
    assert.equal(callFlags.review, false);
    assert.equal(callFlags.comment, false);
    assert.equal(callFlags.user, false);
    assert.equal(result.targetInfo.type, 'ARTICLE');
    assert.equal(result.content?.title, '게시글 제목');
    assert.equal(result.content?.body, '게시글 본문');
    assert.equal(
      result.reportedContent?.type === 'ARTICLE'
        ? result.reportedContent.category
        : null,
      PostsCategory.MOVING_TIP
    );
    assert.equal(result.targetUser?.id, USER_ID);
    assert.deepEqual(result.availableActions, {
      canSuspendUser: true,
      canDeleteContent: true,
    });
  });

  it('COMMENT 상세는 comment 전용 Repository만 호출하고 DTO를 매핑한다', async () => {
    const callFlags = {
      message: false,
      review: false,
      article: false,
      comment: false,
      user: false,
    };

    mock.method(adminReportRepository, 'findAdminReportById', async () =>
      buildDetailRow({
        target: UserReportTarget.COMMENT,
        targetId: '40',
      })
    );
    mock.method(
      adminReportRepository,
      'findReportDetailTargetCommentById',
      async (id: number) => {
        callFlags.comment = true;
        assert.equal(id, 40);
        return {
          id: 40,
          content: '댓글 내용',
          postId: 5,
          createdAt: CREATED_AT,
          deletedAt: null,
          user: {
            id: USER_ID,
            name: '댓글러',
            nickname: 'commenter',
            email: 'commenter@example.com',
            userType: UserType.CUSTOMER,
            deletedAt: null,
            profileImageKey: null,
          },
          post: {
            title: '원글',
            deletedAt: null,
          },
        };
      }
    );
    mock.method(
      adminReportRepository,
      'findReportDetailTargetMessageById',
      async () => {
        callFlags.message = true;
        return null;
      }
    );
    mock.method(
      adminReportRepository,
      'findReportDetailTargetReviewById',
      async () => {
        callFlags.review = true;
        return null;
      }
    );
    mock.method(
      adminReportRepository,
      'findReportDetailTargetArticleById',
      async () => {
        callFlags.article = true;
        return null;
      }
    );
    mock.method(
      adminReportRepository,
      'findReportDetailTargetUserById',
      async () => {
        callFlags.user = true;
        return null;
      }
    );
    mock.method(
      adminReportRepository,
      'findReportDetailSanctionTargetUser',
      async () => ({
        kind: 'found',
        user: { ...sanctionUserRow, reportCount: 4 },
      })
    );
    mock.method(
      adminReportRepository,
      'findReportReportedContent',
      async () => ({
        kind: 'comment',
        content: {
          id: 40,
          postId: 5,
          parentId: null,
          content: '댓글 내용',
          createdAt: CREATED_AT,
          deletedAt: null,
        },
      })
    );
    mock.method(adminReportRepository, 'findAdminReportFirst', async () => ({
      id: REPORT_ID,
    }));

    const result = await getAdminReportDetail(REPORT_ID, defaultDetailQuery);

    assert.equal(callFlags.comment, true);
    assert.equal(callFlags.message, false);
    assert.equal(callFlags.review, false);
    assert.equal(callFlags.article, false);
    assert.equal(callFlags.user, false);
    assert.equal(result.targetInfo.type, 'COMMENT');
    assert.equal(result.content?.body, '댓글 내용');
    assert.equal(
      result.reportedContent?.type === 'COMMENT'
        ? result.reportedContent.postId
        : null,
      5
    );
    assert.equal(result.targetUser?.id, USER_ID);
    assert.deepEqual(result.availableActions, {
      canSuspendUser: true,
      canDeleteContent: true,
    });
  });

  it('USER MOVER 프로필을 매핑하고 customer profile은 null이다', async () => {
    mock.method(adminReportRepository, 'findAdminReportById', async () =>
      buildDetailRow({ target: UserReportTarget.USER, targetId: USER_ID })
    );
    mock.method(
      adminReportRepository,
      'findReportDetailTargetUserById',
      async (id: string) => {
        assert.equal(id, USER_ID);
        return {
          id: USER_ID,
          name: '기사',
          nickname: 'mover',
          email: 'mover@example.com',
          userType: UserType.MOVER,
          deletedAt: null,
          createdAt: CREATED_AT,
          profileImageKey: 'mover/key',
          customerProfile: null,
          moverProfile: {
            service: [MoveType.HOME],
            career: 5,
            shortDescription: '짧은 소개',
            description: '상세 소개',
            serviceRegions: [
              { region: Region.SEOUL },
              { region: Region.GYEONGGI },
            ],
          },
        };
      }
    );
    mock.method(
      adminReportRepository,
      'findReportDetailSanctionTargetUser',
      async () => ({
        kind: 'found',
        user: { ...sanctionUserRow, reportCount: 1 },
      })
    );
    mock.method(adminReportRepository, 'findReportedUserProfile', async () => ({
      kind: 'mover_profile',
      profile: {
        id: USER_ID,
        name: '기사',
        nickname: 'mover',
        profileImageKey: 'mover/key',
        userType: UserType.MOVER,
        deletedAt: null,
        createdAt: CREATED_AT,
        email: 'mover@example.com',
        customerProfile: null,
        moverProfile: {
          service: [MoveType.HOME],
          career: 5,
          shortDescription: '짧은 소개',
          description: '상세 소개',
          serviceRegions: [
            { region: Region.SEOUL },
            { region: Region.GYEONGGI },
          ],
        },
      },
    }));
    mock.method(adminReportRepository, 'findAdminReportFirst', async () => ({
      id: REPORT_ID,
    }));

    const result = await getAdminReportDetail(REPORT_ID, defaultDetailQuery);

    const moverProfile = result.targetInfo.user?.profile?.mover;
    assert.equal(result.targetInfo.user?.profile?.customer, null);
    assert.deepEqual(moverProfile?.service, [MoveType.HOME]);
    assert.equal(moverProfile?.career, 5);
    assert.equal(moverProfile?.shortDescription, '짧은 소개');
    assert.equal(moverProfile?.description, '상세 소개');
    assert.deepEqual(moverProfile?.serviceRegions, [
      { region: Region.SEOUL },
      { region: Region.GYEONGGI },
    ]);
    assert.equal(
      result.reportedContent?.type === 'USER' &&
        result.reportedContent.userType === 'MOVER'
        ? result.reportedContent.career
        : null,
      5
    );
    assert.deepEqual(result.availableActions, {
      canSuspendUser: true,
      canDeleteContent: false,
    });
  });

  it('잘못된 숫자형 targetId면 INTERNAL_SERVER_ERROR를 던진다', async () => {
    mock.method(adminReportRepository, 'findAdminReportById', async () =>
      buildDetailRow({
        target: UserReportTarget.REVIEW,
        targetId: 'invalid',
      })
    );
    mock.method(
      adminReportRepository,
      'findReportDetailSanctionTargetUser',
      async () => ({ kind: 'invalid_target_id' })
    );
    mock.method(
      adminReportRepository,
      'findReportReportedContent',
      async () => ({ kind: 'invalid_target_id' })
    );
    mock.method(adminReportRepository, 'findAdminReportFirst', async () => ({
      id: REPORT_ID,
    }));

    await assert.rejects(
      () => getAdminReportDetail(REPORT_ID, defaultDetailQuery),
      assertAppError('INTERNAL_SERVER_ERROR')
    );
  });

  it('sort=ASC일 때 이전·다음 조회 조건과 정렬을 사용한다', async () => {
    const neighborCalls: Array<{
      where: Prisma.UserReportWhereInput;
      orderBy: Prisma.UserReportOrderByWithRelationInput[];
    }> = [];
    let callIndex = 0;

    setupUserTargetDetailMocks();
    mock.method(
      adminReportRepository,
      'findAdminReportFirst',
      async (
        where: Prisma.UserReportWhereInput,
        orderBy: Prisma.UserReportOrderByWithRelationInput[]
      ) => {
        callIndex += 1;
        if (callIndex === 1) {
          return { id: REPORT_ID };
        }
        neighborCalls.push({ where, orderBy });
        return null;
      }
    );

    await getAdminReportDetail(REPORT_ID, { sort: 'ASC' });

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
        adminReportRepository.buildAdminReportListWhere({}),
        {
          OR: [
            { createdAt: { lt: CREATED_AT } },
            { createdAt: CREATED_AT, id: { gt: REPORT_ID } },
          ],
        },
      ],
    });
    assert.deepEqual(neighborCalls[1]?.where, {
      AND: [
        adminReportRepository.buildAdminReportListWhere({}),
        {
          OR: [
            { createdAt: { gt: CREATED_AT } },
            { createdAt: CREATED_AT, id: { lt: REPORT_ID } },
          ],
        },
      ],
    });
  });

  it('createdAt이 같으면 id를 tie-breaker로 사용한다', async () => {
    const neighborCalls: Array<{
      where: Prisma.UserReportWhereInput;
      orderBy: Prisma.UserReportOrderByWithRelationInput[];
    }> = [];
    let callIndex = 0;

    setupUserTargetDetailMocks();
    mock.method(
      adminReportRepository,
      'findAdminReportFirst',
      async (
        where: Prisma.UserReportWhereInput,
        orderBy: Prisma.UserReportOrderByWithRelationInput[]
      ) => {
        callIndex += 1;
        if (callIndex === 1) {
          return { id: REPORT_ID };
        }
        neighborCalls.push({ where, orderBy });
        return null;
      }
    );

    await getAdminReportDetail(REPORT_ID, defaultDetailQuery);

    const prevOr = (
      neighborCalls[0]?.where as { AND: Prisma.UserReportWhereInput[] }
    ).AND[1] as { OR: Prisma.UserReportWhereInput[] };
    assert.deepEqual(prevOr.OR[1], {
      createdAt: CREATED_AT,
      id: { gt: REPORT_ID },
    });
    const nextOr = (
      neighborCalls[1]?.where as { AND: Prisma.UserReportWhereInput[] }
    ).AND[1] as { OR: Prisma.UserReportWhereInput[] };
    assert.deepEqual(nextOr.OR[1], {
      createdAt: CREATED_AT,
      id: { lt: REPORT_ID },
    });
  });

  it('이전 신고만 있으면 prevId만 채운다', async () => {
    setupUserTargetDetailMocks();
    mockNeighborResponses([{ id: REPORT_ID }, { id: PREV_REPORT_ID }, null]);

    const result = await getAdminReportDetail(REPORT_ID, defaultDetailQuery);

    assert.equal(result.prevId, PREV_REPORT_ID);
    assert.equal(result.nextId, null);
  });

  it('다음 신고만 있으면 nextId만 채운다', async () => {
    setupUserTargetDetailMocks();
    mockNeighborResponses([{ id: REPORT_ID }, null, { id: NEXT_REPORT_ID }]);

    const result = await getAdminReportDetail(REPORT_ID, defaultDetailQuery);

    assert.equal(result.prevId, null);
    assert.equal(result.nextId, NEXT_REPORT_ID);
  });

  it('이전·다음 신고가 모두 있으면 prevId와 nextId를 모두 채운다', async () => {
    setupUserTargetDetailMocks();
    mockNeighborResponses([
      { id: REPORT_ID },
      { id: PREV_REPORT_ID },
      { id: NEXT_REPORT_ID },
    ]);

    const result = await getAdminReportDetail(REPORT_ID, defaultDetailQuery);

    assert.equal(result.prevId, PREV_REPORT_ID);
    assert.equal(result.nextId, NEXT_REPORT_ID);
  });

  it('이전·다음 신고가 모두 없으면 prevId와 nextId가 null이다', async () => {
    setupUserTargetDetailMocks();
    mockNeighborResponses([{ id: REPORT_ID }, null, null]);

    const result = await getAdminReportDetail(REPORT_ID, defaultDetailQuery);

    assert.equal(result.prevId, null);
    assert.equal(result.nextId, null);
  });
});

describe('rejectAdminReport', () => {
  beforeEach(() => {
    mock.timers.enable({ apis: ['Date'], now: FIXED_NOW });
  });

  afterEach(() => {
    mock.timers.reset();
    mock.restoreAll();
  });

  it('PENDING 신고를 REJECTED로 바꾸고 제재 함수를 호출하지 않는다', async () => {
    let suspendCalled = false;
    let deleteCalled = false;
    let historyInput:
      Parameters<typeof historyRepository.createHistory>[0] | undefined;
    const txRefs: unknown[] = [];

    mock.method(auditContext, 'runWithManualAudit', runManualAuditImmediately);
    mock.method(
      auditContext,
      'runAuditedTransaction',
      async (
        fn: (tx: typeof mockTx) => Promise<unknown>,
        options?: { maxWait?: number; timeout?: number }
      ) => {
        assert.deepEqual(options, { maxWait: 5000, timeout: 10000 });
        return fn(mockTx);
      }
    );
    mock.method(
      adminReportRepository,
      'lockAdminReportForStatusChange',
      async (reportId: number, tx: typeof mockTx) => {
        txRefs.push(tx);
        assert.equal(reportId, REPORT_ID);
        return buildPendingLockRow();
      }
    );
    mock.method(
      adminReportRepository,
      'updateAdminReportDecisionStatus',
      async (
        reportId: number,
        adminId: number,
        status: UserReportStatus,
        tx: typeof mockTx
      ) => {
        txRefs.push(tx);
        assert.equal(status, UserReportStatus.REJECTED);
        return {
          kind: 'updated',
          report: {
            id: reportId,
            status: UserReportStatus.REJECTED,
            adminId,
          },
        };
      }
    );
    mock.method(
      historyRepository,
      'createHistory',
      async (data: Prisma.HistoryUncheckedCreateInput, tx: typeof mockTx) => {
        txRefs.push(tx);
        historyInput = data;
        return { id: 1 };
      }
    );
    mock.method(userStatusRepository, 'upsertSuspendedUserStatus', async () => {
      suspendCalled = true;
      return {
        userId: USER_ID,
        status: UserStatus.SUSPENDED,
        suspendedAt: FIXED_NOW,
        suspendedUntil: SUSPEND_UNTIL,
      };
    });
    mock.method(
      adminReportRepository,
      'softDeleteReportReportedContent',
      async () => {
        deleteCalled = true;
        return { kind: 'not_found' };
      }
    );

    const result = await rejectAdminReport({
      reportId: REPORT_ID,
      adminId: ADMIN_ID,
    });

    assert.deepEqual(result, {
      reportId: REPORT_ID,
      status: UserReportStatus.REJECTED,
      adminId: ADMIN_ID,
      processedAt: FIXED_NOW,
    });
    assert.equal(suspendCalled, false);
    assert.equal(deleteCalled, false);
    assert.equal(historyInput?.tableName, 'user_reports');
    assert.equal(historyInput?.operationType, HistoryAction.UPDATE);
    assert.deepEqual(historyInput?.beforeData, {
      id: REPORT_ID,
      status: UserReportStatus.PENDING,
      adminId: null,
    });
    assert.deepEqual(historyInput?.afterData, {
      id: REPORT_ID,
      status: UserReportStatus.REJECTED,
      adminId: ADMIN_ID,
    });
    assert.equal(
      txRefs.every((tx) => tx === mockTx),
      true
    );
  });

  it('이미 처리된 신고면 ADMIN_REPORT_ALREADY_PROCESSED를 던진다', async () => {
    mock.method(auditContext, 'runWithManualAudit', runManualAuditImmediately);
    mock.method(auditContext, 'runAuditedTransaction', runTxImmediately);
    mock.method(
      adminReportRepository,
      'lockAdminReportForStatusChange',
      async () => buildPendingLockRow({ status: UserReportStatus.RESOLVED })
    );

    await assert.rejects(
      () => rejectAdminReport({ reportId: REPORT_ID, adminId: ADMIN_ID }),
      assertAppError('ADMIN_REPORT_ALREADY_PROCESSED')
    );
  });

  it('잠금 조회 결과가 null이면 ADMIN_REPORT_NOT_FOUND를 던진다', async () => {
    setupAuditTxMocks();
    mock.method(
      adminReportRepository,
      'lockAdminReportForStatusChange',
      async () => null
    );

    await assert.rejects(
      () => rejectAdminReport({ reportId: REPORT_ID, adminId: ADMIN_ID }),
      assertAppError('ADMIN_REPORT_NOT_FOUND')
    );
  });

  it('상태 업데이트가 not_updated면 ADMIN_REPORT_CONFLICT를 던지고 History를 생성하지 않는다', async () => {
    let historyCalled = false;

    setupAuditTxMocks();
    mock.method(
      adminReportRepository,
      'lockAdminReportForStatusChange',
      async () => buildPendingLockRow()
    );
    mock.method(
      adminReportRepository,
      'updateAdminReportDecisionStatus',
      async () => ({ kind: 'not_updated' })
    );
    mock.method(historyRepository, 'createHistory', async () => {
      historyCalled = true;
      return { id: 1 };
    });

    await assert.rejects(
      () => rejectAdminReport({ reportId: REPORT_ID, adminId: ADMIN_ID }),
      assertAppError('ADMIN_REPORT_CONFLICT')
    );
    assert.equal(historyCalled, false);
  });

  it('History 생성이 실패하면 성공 결과를 반환하지 않고 에러가 전파된다', async () => {
    setupAuditTxMocks();
    mock.method(
      adminReportRepository,
      'lockAdminReportForStatusChange',
      async () => buildPendingLockRow()
    );
    mock.method(
      adminReportRepository,
      'updateAdminReportDecisionStatus',
      async () => ({
        kind: 'updated',
        report: {
          id: REPORT_ID,
          status: UserReportStatus.REJECTED,
          adminId: ADMIN_ID,
        },
      })
    );
    mock.method(historyRepository, 'createHistory', async () => {
      throw new Error('history failed');
    });

    await assert.rejects(
      () => rejectAdminReport({ reportId: REPORT_ID, adminId: ADMIN_ID }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, 'history failed');
        return true;
      }
    );
  });
});

describe('resolveAdminReport', () => {
  beforeEach(() => {
    mock.timers.enable({ apis: ['Date'], now: FIXED_NOW });
  });

  afterEach(() => {
    mock.timers.reset();
    mock.restoreAll();
  });

  it('빈 actions면 ADMIN_REPORT_INVALID_ACTIONS를 던진다', async () => {
    mock.method(auditContext, 'runWithManualAudit', runManualAuditImmediately);
    mock.method(auditContext, 'runAuditedTransaction', runTxImmediately);
    mock.method(
      adminReportRepository,
      'lockAdminReportForStatusChange',
      async () => buildPendingLockRow()
    );

    await assert.rejects(
      () =>
        resolveAdminReport({
          reportId: REPORT_ID,
          adminId: ADMIN_ID,
          actions: [],
        }),
      assertAppError('ADMIN_REPORT_INVALID_ACTIONS')
    );
  });

  it('USER에 DELETE_REPORTED_CONTENT를 요청하면 ADMIN_REPORT_INVALID_ACTIONS를 던진다', async () => {
    mock.method(auditContext, 'runWithManualAudit', runManualAuditImmediately);
    mock.method(auditContext, 'runAuditedTransaction', runTxImmediately);
    mock.method(
      adminReportRepository,
      'lockAdminReportForStatusChange',
      async () => buildPendingLockRow({ target: UserReportTarget.USER })
    );

    await assert.rejects(
      () =>
        resolveAdminReport({
          reportId: REPORT_ID,
          adminId: ADMIN_ID,
          actions: ['DELETE_REPORTED_CONTENT'],
        }),
      assertAppError('ADMIN_REPORT_INVALID_ACTIONS')
    );
  });

  it('REVIEW 신고를 정지·삭제하고 RESOLVED History를 남긴다', async () => {
    let statusUpdateCalled = false;
    let deleteCalled = false;
    const historyInputs: Array<
      Parameters<typeof historyRepository.createHistory>[0]
    > = [];

    mock.method(auditContext, 'runWithManualAudit', runManualAuditImmediately);
    mock.method(auditContext, 'runAuditedTransaction', runTxImmediately);
    mock.method(
      adminReportRepository,
      'lockAdminReportForStatusChange',
      async () =>
        buildPendingLockRow({
          target: UserReportTarget.REVIEW,
          targetId: '15',
        })
    );
    mock.method(
      adminReportRepository,
      'findReportSanctionTargetUser',
      async () => ({ kind: 'found', user: sanctionUserRow })
    );
    mock.method(
      adminMemberRepository,
      'lockAdminMemberForStatusChange',
      async () => ({ id: USER_ID })
    );
    mock.method(
      adminMemberRepository,
      'findAdminMemberStatus',
      async () => null
    );
    mock.method(
      userStatusRepository,
      'upsertSuspendedUserStatus',
      async (data: userStatusRepository.SuspendUserStatusInput) => {
        assert.equal(data.userId, USER_ID);
        assert.equal(data.suspendedAt.getTime(), FIXED_NOW.getTime());
        assert.equal(data.suspendedUntil.getTime(), SUSPEND_UNTIL.getTime());
        return {
          userId: USER_ID,
          status: UserStatus.SUSPENDED,
          suspendedAt: FIXED_NOW,
          suspendedUntil: SUSPEND_UNTIL,
        };
      }
    );
    mock.method(
      adminReportRepository,
      'softDeleteReportReportedContent',
      async (_target: UserReportTarget, targetId: string, deletedAt: Date) => {
        deleteCalled = true;
        assert.equal(targetId, '15');
        assert.equal(deletedAt.getTime(), FIXED_NOW.getTime());
        return {
          kind: 'deleted',
          target: UserReportTarget.REVIEW,
          id: 15,
          deletedContents: [{ id: 15, deletedAt: FIXED_NOW }],
          postCommentCountChange: null,
        };
      }
    );
    mock.method(
      adminReportRepository,
      'updateAdminReportDecisionStatus',
      async () => {
        statusUpdateCalled = true;
        return {
          kind: 'updated',
          report: {
            id: REPORT_ID,
            status: UserReportStatus.RESOLVED,
            adminId: ADMIN_ID,
          },
        };
      }
    );
    mock.method(
      historyRepository,
      'createHistory',
      async (data: Prisma.HistoryUncheckedCreateInput) => {
        historyInputs.push(data);
        return { id: 1 };
      }
    );

    const result = await resolveAdminReport({
      reportId: REPORT_ID,
      adminId: ADMIN_ID,
      actions: ['SUSPEND_TARGET_USER', 'DELETE_REPORTED_CONTENT'],
    });

    assert.equal(deleteCalled, true);
    assert.equal(statusUpdateCalled, true);
    assert.deepEqual(result, {
      reportId: REPORT_ID,
      status: UserReportStatus.RESOLVED,
      adminId: ADMIN_ID,
      actions: ['SUSPEND_TARGET_USER', 'DELETE_REPORTED_CONTENT'],
      processedAt: FIXED_NOW,
      contentAlreadyDeleted: false,
    });
    assert.equal(
      historyInputs.some(
        (input) =>
          input.tableName === 'user_statuses' &&
          input.operationType === HistoryAction.CREATE
      ),
      true
    );
    assert.equal(
      historyInputs.some(
        (input) =>
          input.tableName === 'reviews' &&
          input.operationType === HistoryAction.DELETE
      ),
      true
    );
    assert.equal(
      historyInputs.some((input) => input.tableName === 'user_reports'),
      true
    );
  });

  it('대상 사용자가 없으면 ADMIN_REPORT_TARGET_USER_NOT_FOUND를 던지고 상태를 바꾸지 않는다', async () => {
    let statusUpdateCalled = false;

    mock.method(auditContext, 'runWithManualAudit', runManualAuditImmediately);
    mock.method(auditContext, 'runAuditedTransaction', runTxImmediately);
    mock.method(
      adminReportRepository,
      'lockAdminReportForStatusChange',
      async () => buildPendingLockRow()
    );
    mock.method(
      adminReportRepository,
      'findReportSanctionTargetUser',
      async () => ({ kind: 'not_found' })
    );
    mock.method(
      adminReportRepository,
      'updateAdminReportDecisionStatus',
      async () => {
        statusUpdateCalled = true;
        return {
          kind: 'updated',
          report: {
            id: REPORT_ID,
            status: UserReportStatus.RESOLVED,
            adminId: ADMIN_ID,
          },
        };
      }
    );

    await assert.rejects(
      () =>
        resolveAdminReport({
          reportId: REPORT_ID,
          adminId: ADMIN_ID,
          actions: ['SUSPEND_TARGET_USER'],
        }),
      assertAppError('ADMIN_REPORT_TARGET_USER_NOT_FOUND')
    );
    assert.equal(statusUpdateCalled, false);
  });

  it('콘텐츠가 없으면 ADMIN_REPORT_CONTENT_NOT_FOUND를 던진다', async () => {
    mock.method(auditContext, 'runWithManualAudit', runManualAuditImmediately);
    mock.method(auditContext, 'runAuditedTransaction', runTxImmediately);
    mock.method(
      adminReportRepository,
      'lockAdminReportForStatusChange',
      async () =>
        buildPendingLockRow({
          target: UserReportTarget.ARTICLE,
          targetId: '20',
        })
    );
    mock.method(
      adminReportRepository,
      'softDeleteReportReportedContent',
      async () => ({ kind: 'not_found' })
    );

    await assert.rejects(
      () =>
        resolveAdminReport({
          reportId: REPORT_ID,
          adminId: ADMIN_ID,
          actions: ['DELETE_REPORTED_CONTENT'],
        }),
      assertAppError('ADMIN_REPORT_CONTENT_NOT_FOUND')
    );
  });

  it('이미 삭제된 콘텐츠면 contentAlreadyDeleted가 true다', async () => {
    mock.method(auditContext, 'runWithManualAudit', runManualAuditImmediately);
    mock.method(auditContext, 'runAuditedTransaction', runTxImmediately);
    mock.method(
      adminReportRepository,
      'lockAdminReportForStatusChange',
      async () =>
        buildPendingLockRow({
          target: UserReportTarget.COMMENT,
          targetId: '30',
        })
    );
    mock.method(
      adminReportRepository,
      'softDeleteReportReportedContent',
      async () => ({
        kind: 'already_deleted',
        target: UserReportTarget.COMMENT,
        id: 30,
      })
    );
    mock.method(
      adminReportRepository,
      'updateAdminReportDecisionStatus',
      async () => ({
        kind: 'updated',
        report: {
          id: REPORT_ID,
          status: UserReportStatus.RESOLVED,
          adminId: ADMIN_ID,
        },
      })
    );
    mock.method(historyRepository, 'createHistory', async () => ({ id: 1 }));

    const result = await resolveAdminReport({
      reportId: REPORT_ID,
      adminId: ADMIN_ID,
      actions: ['DELETE_REPORTED_CONTENT'],
    });

    assert.equal(result.contentAlreadyDeleted, true);
  });

  it('잠금 조회 결과가 null이면 ADMIN_REPORT_NOT_FOUND를 던지고 History를 생성하지 않는다', async () => {
    let historyCalled = false;

    setupAuditTxMocks();
    mock.method(
      adminReportRepository,
      'lockAdminReportForStatusChange',
      async () => null
    );
    mock.method(historyRepository, 'createHistory', async () => {
      historyCalled = true;
      return { id: 1 };
    });

    await assert.rejects(
      () =>
        resolveAdminReport({
          reportId: REPORT_ID,
          adminId: ADMIN_ID,
          actions: ['SUSPEND_TARGET_USER'],
        }),
      assertAppError('ADMIN_REPORT_NOT_FOUND')
    );
    assert.equal(historyCalled, false);
  });

  it('신고 상태가 RESOLVED이면 ADMIN_REPORT_ALREADY_PROCESSED를 던진다', async () => {
    setupAuditTxMocks();
    mock.method(
      adminReportRepository,
      'lockAdminReportForStatusChange',
      async () => buildPendingLockRow({ status: UserReportStatus.RESOLVED })
    );

    await assert.rejects(
      () =>
        resolveAdminReport({
          reportId: REPORT_ID,
          adminId: ADMIN_ID,
          actions: ['SUSPEND_TARGET_USER'],
        }),
      assertAppError('ADMIN_REPORT_ALREADY_PROCESSED')
    );
  });

  it('신고 상태가 REJECTED이면 ADMIN_REPORT_ALREADY_PROCESSED를 던진다', async () => {
    setupAuditTxMocks();
    mock.method(
      adminReportRepository,
      'lockAdminReportForStatusChange',
      async () => buildPendingLockRow({ status: UserReportStatus.REJECTED })
    );

    await assert.rejects(
      () =>
        resolveAdminReport({
          reportId: REPORT_ID,
          adminId: ADMIN_ID,
          actions: ['SUSPEND_TARGET_USER'],
        }),
      assertAppError('ADMIN_REPORT_ALREADY_PROCESSED')
    );
  });

  it('상태 업데이트가 not_updated면 ADMIN_REPORT_CONFLICT를 던지고 user_reports History를 생성하지 않는다', async () => {
    const historyInputs: Array<
      Parameters<typeof historyRepository.createHistory>[0]
    > = [];

    setupAuditTxMocks();
    mock.method(
      adminReportRepository,
      'lockAdminReportForStatusChange',
      async () => buildPendingLockRow()
    );
    mock.method(
      adminReportRepository,
      'findReportSanctionTargetUser',
      async () => ({ kind: 'found', user: sanctionUserRow })
    );
    mock.method(
      adminMemberRepository,
      'lockAdminMemberForStatusChange',
      async () => ({ id: USER_ID })
    );
    mock.method(
      adminMemberRepository,
      'findAdminMemberStatus',
      async () => null
    );
    mock.method(
      userStatusRepository,
      'upsertSuspendedUserStatus',
      async () => ({
        userId: USER_ID,
        status: UserStatus.SUSPENDED,
        suspendedAt: FIXED_NOW,
        suspendedUntil: SUSPEND_UNTIL,
      })
    );
    mock.method(
      adminReportRepository,
      'updateAdminReportDecisionStatus',
      async () => ({ kind: 'not_updated' })
    );
    mock.method(
      historyRepository,
      'createHistory',
      async (data: Prisma.HistoryUncheckedCreateInput) => {
        historyInputs.push(data);
        return { id: 1 };
      }
    );

    await assert.rejects(
      () =>
        resolveAdminReport({
          reportId: REPORT_ID,
          adminId: ADMIN_ID,
          actions: ['SUSPEND_TARGET_USER'],
        }),
      assertAppError('ADMIN_REPORT_CONFLICT')
    );
    assert.equal(
      historyInputs.some((input) => input.tableName === 'user_reports'),
      false
    );
  });

  it('Action 검증 실패 시 정지·삭제·상태 업데이트를 실행하지 않는다', async () => {
    let sanctionCalled = false;
    let deleteCalled = false;
    let statusUpdateCalled = false;

    setupAuditTxMocks();
    mock.method(
      adminReportRepository,
      'lockAdminReportForStatusChange',
      async () =>
        buildPendingLockRow({
          target: UserReportTarget.MESSAGE,
          targetId: '50',
        })
    );
    mock.method(
      adminReportRepository,
      'findReportSanctionTargetUser',
      async () => {
        sanctionCalled = true;
        return { kind: 'found', user: sanctionUserRow };
      }
    );
    mock.method(
      adminReportRepository,
      'softDeleteReportReportedContent',
      async () => {
        deleteCalled = true;
        return { kind: 'unsupported_target' };
      }
    );
    mock.method(
      adminReportRepository,
      'updateAdminReportDecisionStatus',
      async () => {
        statusUpdateCalled = true;
        return {
          kind: 'updated',
          report: {
            id: REPORT_ID,
            status: UserReportStatus.RESOLVED,
            adminId: ADMIN_ID,
          },
        };
      }
    );

    await assert.rejects(
      () =>
        resolveAdminReport({
          reportId: REPORT_ID,
          adminId: ADMIN_ID,
          actions: ['DELETE_REPORTED_CONTENT'],
        }),
      assertAppError('ADMIN_REPORT_INVALID_ACTIONS')
    );
    assert.equal(sanctionCalled, false);
    assert.equal(deleteCalled, false);
    assert.equal(statusUpdateCalled, false);
  });

  it('USER 대상 SUSPEND_TARGET_USER는 신고 대상 사용자를 정지한다', async () => {
    let sanctionArgs:
      | {
          target: UserReportTarget;
          targetId: string;
          tx: typeof mockTx;
        }
      | undefined;
    let lockUserId: string | undefined;
    const txRefs: unknown[] = [];

    setupAuditTxMocks();
    mock.method(
      adminReportRepository,
      'lockAdminReportForStatusChange',
      async () =>
        buildPendingLockRow({
          target: UserReportTarget.USER,
          targetId: USER_ID,
        })
    );
    mock.method(
      adminReportRepository,
      'findReportSanctionTargetUser',
      async (target: UserReportTarget, targetId: string, tx: typeof mockTx) => {
        sanctionArgs = { target, targetId, tx };
        return { kind: 'found', user: sanctionUserRow };
      }
    );
    mock.method(
      adminMemberRepository,
      'lockAdminMemberForStatusChange',
      async (userId: string, tx: typeof mockTx) => {
        lockUserId = userId;
        txRefs.push(tx);
        return { id: USER_ID };
      }
    );
    mock.method(
      adminMemberRepository,
      'findAdminMemberStatus',
      async () => null
    );
    mock.method(
      userStatusRepository,
      'upsertSuspendedUserStatus',
      async (
        data: userStatusRepository.SuspendUserStatusInput,
        tx: typeof mockTx
      ) => {
        txRefs.push(tx);
        assert.equal(data.userId, USER_ID);
        assert.equal(data.suspendedAt.getTime(), FIXED_NOW.getTime());
        assert.equal(data.suspendedUntil.getTime(), SUSPEND_UNTIL.getTime());
        return {
          userId: USER_ID,
          status: UserStatus.SUSPENDED,
          suspendedAt: FIXED_NOW,
          suspendedUntil: SUSPEND_UNTIL,
        };
      }
    );
    mock.method(
      adminReportRepository,
      'updateAdminReportDecisionStatus',
      async () => ({
        kind: 'updated',
        report: {
          id: REPORT_ID,
          status: UserReportStatus.RESOLVED,
          adminId: ADMIN_ID,
        },
      })
    );
    mock.method(historyRepository, 'createHistory', async () => ({ id: 1 }));

    await resolveAdminReport({
      reportId: REPORT_ID,
      adminId: ADMIN_ID,
      actions: ['SUSPEND_TARGET_USER'],
    });

    assert.deepEqual(sanctionArgs, {
      target: UserReportTarget.USER,
      targetId: USER_ID,
      tx: mockTx,
    });
    assert.equal(lockUserId, USER_ID);
    assert.equal(
      txRefs.every((tx) => tx === mockTx),
      true
    );
  });

  it('MESSAGE 대상 SUSPEND_TARGET_USER는 메시지 발신자를 정지한다', async () => {
    let sanctionArgs:
      { target: UserReportTarget; targetId: string } | undefined;
    let lockUserId: string | undefined;

    setupAuditTxMocks();
    mock.method(
      adminReportRepository,
      'lockAdminReportForStatusChange',
      async () =>
        buildPendingLockRow({
          target: UserReportTarget.MESSAGE,
          targetId: '50',
        })
    );
    mock.method(
      adminReportRepository,
      'findReportSanctionTargetUser',
      async (target: UserReportTarget, targetId: string) => {
        sanctionArgs = { target, targetId };
        return {
          kind: 'found',
          user: { ...sanctionUserRow, id: SENDER_ID },
        };
      }
    );
    mock.method(
      adminMemberRepository,
      'lockAdminMemberForStatusChange',
      async (userId: string) => {
        lockUserId = userId;
        return { id: SENDER_ID };
      }
    );
    mock.method(
      adminMemberRepository,
      'findAdminMemberStatus',
      async () => null
    );
    mock.method(
      userStatusRepository,
      'upsertSuspendedUserStatus',
      async (data: userStatusRepository.SuspendUserStatusInput) => {
        assert.equal(data.userId, SENDER_ID);
        return {
          userId: SENDER_ID,
          status: UserStatus.SUSPENDED,
          suspendedAt: FIXED_NOW,
          suspendedUntil: SUSPEND_UNTIL,
        };
      }
    );
    mock.method(
      adminReportRepository,
      'updateAdminReportDecisionStatus',
      async () => ({
        kind: 'updated',
        report: {
          id: REPORT_ID,
          status: UserReportStatus.RESOLVED,
          adminId: ADMIN_ID,
        },
      })
    );
    mock.method(historyRepository, 'createHistory', async () => ({ id: 1 }));

    await resolveAdminReport({
      reportId: REPORT_ID,
      adminId: ADMIN_ID,
      actions: ['SUSPEND_TARGET_USER'],
    });

    assert.deepEqual(sanctionArgs, {
      target: UserReportTarget.MESSAGE,
      targetId: '50',
    });
    assert.equal(lockUserId, SENDER_ID);
  });

  it('REVIEW 대상 SUSPEND_TARGET_USER는 리뷰 작성자를 정지한다', async () => {
    let sanctionTargetId: string | undefined;
    let lockUserId: string | undefined;

    setupAuditTxMocks();
    mock.method(
      adminReportRepository,
      'lockAdminReportForStatusChange',
      async () =>
        buildPendingLockRow({
          target: UserReportTarget.REVIEW,
          targetId: '15',
        })
    );
    mock.method(
      adminReportRepository,
      'findReportSanctionTargetUser',
      async (_target: UserReportTarget, targetId: string) => {
        sanctionTargetId = targetId;
        return { kind: 'found', user: sanctionUserRow };
      }
    );
    mock.method(
      adminMemberRepository,
      'lockAdminMemberForStatusChange',
      async (userId: string) => {
        lockUserId = userId;
        return { id: USER_ID };
      }
    );
    mock.method(
      adminMemberRepository,
      'findAdminMemberStatus',
      async () => null
    );
    mock.method(
      userStatusRepository,
      'upsertSuspendedUserStatus',
      async () => ({
        userId: USER_ID,
        status: UserStatus.SUSPENDED,
        suspendedAt: FIXED_NOW,
        suspendedUntil: SUSPEND_UNTIL,
      })
    );
    mock.method(
      adminReportRepository,
      'updateAdminReportDecisionStatus',
      async () => ({
        kind: 'updated',
        report: {
          id: REPORT_ID,
          status: UserReportStatus.RESOLVED,
          adminId: ADMIN_ID,
        },
      })
    );
    mock.method(historyRepository, 'createHistory', async () => ({ id: 1 }));

    await resolveAdminReport({
      reportId: REPORT_ID,
      adminId: ADMIN_ID,
      actions: ['SUSPEND_TARGET_USER'],
    });

    assert.equal(sanctionTargetId, '15');
    assert.equal(lockUserId, USER_ID);
  });

  it('ARTICLE 대상 SUSPEND_TARGET_USER는 게시글 작성자를 정지한다', async () => {
    let sanctionTargetId: string | undefined;
    let lockUserId: string | undefined;

    setupAuditTxMocks();
    mock.method(
      adminReportRepository,
      'lockAdminReportForStatusChange',
      async () =>
        buildPendingLockRow({
          target: UserReportTarget.ARTICLE,
          targetId: '20',
        })
    );
    mock.method(
      adminReportRepository,
      'findReportSanctionTargetUser',
      async (_target: UserReportTarget, targetId: string) => {
        sanctionTargetId = targetId;
        return { kind: 'found', user: sanctionUserRow };
      }
    );
    mock.method(
      adminMemberRepository,
      'lockAdminMemberForStatusChange',
      async (userId: string) => {
        lockUserId = userId;
        return { id: USER_ID };
      }
    );
    mock.method(
      adminMemberRepository,
      'findAdminMemberStatus',
      async () => null
    );
    mock.method(
      userStatusRepository,
      'upsertSuspendedUserStatus',
      async () => ({
        userId: USER_ID,
        status: UserStatus.SUSPENDED,
        suspendedAt: FIXED_NOW,
        suspendedUntil: SUSPEND_UNTIL,
      })
    );
    mock.method(
      adminReportRepository,
      'updateAdminReportDecisionStatus',
      async () => ({
        kind: 'updated',
        report: {
          id: REPORT_ID,
          status: UserReportStatus.RESOLVED,
          adminId: ADMIN_ID,
        },
      })
    );
    mock.method(historyRepository, 'createHistory', async () => ({ id: 1 }));

    await resolveAdminReport({
      reportId: REPORT_ID,
      adminId: ADMIN_ID,
      actions: ['SUSPEND_TARGET_USER'],
    });

    assert.equal(sanctionTargetId, '20');
    assert.equal(lockUserId, USER_ID);
  });

  it('COMMENT 대상 SUSPEND_TARGET_USER는 댓글 작성자를 정지한다', async () => {
    let sanctionTargetId: string | undefined;
    let lockUserId: string | undefined;

    setupAuditTxMocks();
    mock.method(
      adminReportRepository,
      'lockAdminReportForStatusChange',
      async () =>
        buildPendingLockRow({
          target: UserReportTarget.COMMENT,
          targetId: '30',
        })
    );
    mock.method(
      adminReportRepository,
      'findReportSanctionTargetUser',
      async (_target: UserReportTarget, targetId: string) => {
        sanctionTargetId = targetId;
        return { kind: 'found', user: sanctionUserRow };
      }
    );
    mock.method(
      adminMemberRepository,
      'lockAdminMemberForStatusChange',
      async (userId: string) => {
        lockUserId = userId;
        return { id: USER_ID };
      }
    );
    mock.method(
      adminMemberRepository,
      'findAdminMemberStatus',
      async () => null
    );
    mock.method(
      userStatusRepository,
      'upsertSuspendedUserStatus',
      async () => ({
        userId: USER_ID,
        status: UserStatus.SUSPENDED,
        suspendedAt: FIXED_NOW,
        suspendedUntil: SUSPEND_UNTIL,
      })
    );
    mock.method(
      adminReportRepository,
      'updateAdminReportDecisionStatus',
      async () => ({
        kind: 'updated',
        report: {
          id: REPORT_ID,
          status: UserReportStatus.RESOLVED,
          adminId: ADMIN_ID,
        },
      })
    );
    mock.method(historyRepository, 'createHistory', async () => ({ id: 1 }));

    await resolveAdminReport({
      reportId: REPORT_ID,
      adminId: ADMIN_ID,
      actions: ['SUSPEND_TARGET_USER'],
    });

    assert.equal(sanctionTargetId, '30');
    assert.equal(lockUserId, USER_ID);
  });

  it('기존 user_statuses row가 있으면 History operation이 UPDATE다', async () => {
    const historyInputs: Array<
      Parameters<typeof historyRepository.createHistory>[0]
    > = [];

    setupAuditTxMocks();
    mock.method(
      adminReportRepository,
      'lockAdminReportForStatusChange',
      async () => buildPendingLockRow()
    );
    mock.method(
      adminReportRepository,
      'findReportSanctionTargetUser',
      async () => ({ kind: 'found', user: sanctionUserRow })
    );
    mock.method(
      adminMemberRepository,
      'lockAdminMemberForStatusChange',
      async () => ({ id: USER_ID })
    );
    mock.method(adminMemberRepository, 'findAdminMemberStatus', async () => ({
      userId: USER_ID,
      status: UserStatus.ACTIVE,
      suspendedAt: null,
      suspendedUntil: null,
    }));
    mock.method(
      userStatusRepository,
      'upsertSuspendedUserStatus',
      async () => ({
        userId: USER_ID,
        status: UserStatus.SUSPENDED,
        suspendedAt: FIXED_NOW,
        suspendedUntil: SUSPEND_UNTIL,
      })
    );
    mock.method(
      adminReportRepository,
      'updateAdminReportDecisionStatus',
      async () => ({
        kind: 'updated',
        report: {
          id: REPORT_ID,
          status: UserReportStatus.RESOLVED,
          adminId: ADMIN_ID,
        },
      })
    );
    mock.method(
      historyRepository,
      'createHistory',
      async (data: Prisma.HistoryUncheckedCreateInput) => {
        historyInputs.push(data);
        return { id: 1 };
      }
    );

    await resolveAdminReport({
      reportId: REPORT_ID,
      adminId: ADMIN_ID,
      actions: ['SUSPEND_TARGET_USER'],
    });

    const statusHistory = historyInputs.find(
      (input) => input.tableName === 'user_statuses'
    );
    assert.equal(statusHistory?.operationType, HistoryAction.UPDATE);
    assert.equal(statusHistory?.tableRowId, USER_ID);
  });

  it('ARTICLE DELETE_REPORTED_CONTENT는 posts History를 남긴다', async () => {
    const historyInputs: Array<
      Parameters<typeof historyRepository.createHistory>[0]
    > = [];
    const txRefs: unknown[] = [];

    setupAuditTxMocks();
    mock.method(
      adminReportRepository,
      'lockAdminReportForStatusChange',
      async () =>
        buildPendingLockRow({
          target: UserReportTarget.ARTICLE,
          targetId: '20',
        })
    );
    mock.method(
      adminReportRepository,
      'softDeleteReportReportedContent',
      async (
        target: UserReportTarget,
        targetId: string,
        deletedAt: Date,
        tx: typeof mockTx
      ) => {
        txRefs.push(tx);
        assert.equal(target, UserReportTarget.ARTICLE);
        assert.equal(targetId, '20');
        assert.equal(deletedAt.getTime(), FIXED_NOW.getTime());
        return {
          kind: 'deleted',
          target: UserReportTarget.ARTICLE,
          id: 20,
          deletedContents: [{ id: 20, deletedAt: FIXED_NOW }],
          postCommentCountChange: null,
        };
      }
    );
    mock.method(
      adminReportRepository,
      'updateAdminReportDecisionStatus',
      async (
        _reportId: number,
        _adminId: number,
        _status: UserReportStatus,
        tx: typeof mockTx
      ) => {
        txRefs.push(tx);
        return {
          kind: 'updated',
          report: {
            id: REPORT_ID,
            status: UserReportStatus.RESOLVED,
            adminId: ADMIN_ID,
          },
        };
      }
    );
    mock.method(
      historyRepository,
      'createHistory',
      async (data: Prisma.HistoryUncheckedCreateInput, tx: typeof mockTx) => {
        txRefs.push(tx);
        historyInputs.push(data);
        return { id: 1 };
      }
    );

    const result = await resolveAdminReport({
      reportId: REPORT_ID,
      adminId: ADMIN_ID,
      actions: ['DELETE_REPORTED_CONTENT'],
    });

    assert.equal(result.contentAlreadyDeleted, false);
    const postHistory = historyInputs.find(
      (input) =>
        input.tableName === 'posts' &&
        input.operationType === HistoryAction.DELETE
    );
    assert.equal(postHistory?.tableRowId, '20');
    assert.equal(
      txRefs.every((tx) => tx === mockTx),
      true
    );
  });

  it('COMMENT DELETE_REPORTED_CONTENT는 comments History와 posts commentCount History를 남긴다', async () => {
    const historyInputs: Array<
      Parameters<typeof historyRepository.createHistory>[0]
    > = [];

    setupAuditTxMocks();
    mock.method(
      adminReportRepository,
      'lockAdminReportForStatusChange',
      async () =>
        buildPendingLockRow({
          target: UserReportTarget.COMMENT,
          targetId: '30',
        })
    );
    mock.method(
      adminReportRepository,
      'softDeleteReportReportedContent',
      async () => ({
        kind: 'deleted',
        target: UserReportTarget.COMMENT,
        id: 30,
        deletedContents: [{ id: 30, deletedAt: FIXED_NOW }],
        postCommentCountChange: {
          postId: 5,
          beforeCommentCount: 10,
          afterCommentCount: 9,
        },
      })
    );
    mock.method(
      adminReportRepository,
      'updateAdminReportDecisionStatus',
      async () => ({
        kind: 'updated',
        report: {
          id: REPORT_ID,
          status: UserReportStatus.RESOLVED,
          adminId: ADMIN_ID,
        },
      })
    );
    mock.method(
      historyRepository,
      'createHistory',
      async (data: Prisma.HistoryUncheckedCreateInput) => {
        historyInputs.push(data);
        return { id: 1 };
      }
    );

    const result = await resolveAdminReport({
      reportId: REPORT_ID,
      adminId: ADMIN_ID,
      actions: ['DELETE_REPORTED_CONTENT'],
    });

    assert.equal(result.contentAlreadyDeleted, false);
    const commentHistory = historyInputs.find(
      (input) =>
        input.tableName === 'comments' &&
        input.operationType === HistoryAction.DELETE
    );
    assert.equal(commentHistory?.tableRowId, '30');
    const postCountHistory = historyInputs.find(
      (input) =>
        input.tableName === 'posts' &&
        input.operationType === HistoryAction.UPDATE
    );
    assert.equal(postCountHistory?.tableRowId, '5');
    assert.deepEqual(postCountHistory?.beforeData, {
      id: 5,
      commentCount: 10,
    });
    assert.deepEqual(postCountHistory?.afterData, {
      id: 5,
      commentCount: 9,
    });
  });
});
