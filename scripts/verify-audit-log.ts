/**
 * Sprint 7 — History 감사로그 하이브리드 통합 검증
 *
 * 사전: SSH 터널로 DATABASE_URL(127.0.0.1:5432) 연결 가능해야 함
 * 실행: npx ts-node -r dotenv/config scripts/verify-audit-log.ts
 *
 * 시나리오 후 생성한 테스트 row·histories는 정리한다.
 */
import {
  HistoryAction,
  PostsCategory,
  UserReportCategory,
  UserReportTarget,
  UserStatus,
  UserType,
} from '@prisma/client';
import {
  runAuditedTransaction,
  runWithManualAudit,
} from '../src/lib/audit-context';
import { prisma } from '../src/lib/prisma';
import { auditContextStorage } from '../src/lib/request-context';
import { createHistory } from '../src/repositories/history.repository';
import { releaseExpiredSuspensions } from '../src/services/user-status.service';

const FAIL = (name: string, detail: string): never => {
  throw new Error(`[FAIL] ${name}: ${detail}`);
};

const PASS = (name: string, detail?: string) => {
  console.log(`[PASS] ${name}${detail ? ` — ${detail}` : ''}`);
};

const marker = `audit-verify-${Date.now()}`;

const main = async () => {
  console.log('=== audit log hybrid verification ===\n');

  // 0) 트리거 존재
  const triggers = await prisma.$queryRaw<{ tgname: string }[]>`
    SELECT tgname
    FROM pg_trigger
    WHERE tgname LIKE 'trg_audit_%'
    ORDER BY tgname
  `;
  if (triggers.length < 12) {
    FAIL('triggers', `expected >= 12, got ${triggers.length}`);
  }
  PASS('triggers', `${triggers.length} trg_audit_*`);

  // 테스트용 유저 2명 + (가능하면) 관리자 1명
  const reporter = await prisma.user.create({
    data: {
      name: marker,
      nickname: `${marker}-r`,
      email: `${marker}-r@example.com`,
      userType: UserType.CUSTOMER,
      userStatus: { create: { status: UserStatus.ACTIVE } },
    },
    select: { id: true },
  });
  const targetUser = await prisma.user.create({
    data: {
      name: marker,
      nickname: `${marker}-t`,
      email: `${marker}-t@example.com`,
      userType: UserType.MOVER,
      userStatus: { create: { status: UserStatus.ACTIVE } },
    },
    select: { id: true },
  });
  const admin = await prisma.adminUser.findFirst({
    select: { id: true },
    orderBy: { id: 'asc' },
  });

  const createdReportIds: number[] = [];
  const createdPostIds: number[] = [];
  const historyIdsToDelete: number[] = [];

  try {
    // 1) 신고 CREATE → History CREATE + user_id = reporter
    const report = await auditContextStorage.run(
      { userId: reporter.id },
      async () =>
        prisma.userReport.create({
          data: {
            reporterId: reporter.id,
            target: UserReportTarget.USER,
            targetId: targetUser.id,
            category: UserReportCategory.ABUSIVE_LANGUAGE,
          },
          select: { id: true, reporterId: true },
        })
    );
    createdReportIds.push(report.id);

    const reportHistories = await prisma.history.findMany({
      where: {
        tableName: 'user_reports',
        tableRowId: String(report.id),
        operationType: HistoryAction.CREATE,
      },
      orderBy: { id: 'desc' },
      take: 3,
    });
    historyIdsToDelete.push(...reportHistories.map((h) => h.id));

    if (reportHistories.length !== 1) {
      FAIL(
        'report CREATE history',
        `expected 1 row, got ${reportHistories.length}`
      );
    }
    if (reportHistories[0].userId !== reporter.id) {
      FAIL(
        'report CREATE actor',
        `expected userId=${reporter.id}, got ${reportHistories[0].userId}`
      );
    }
    if (reportHistories[0].beforeData !== null) {
      FAIL('report CREATE before', 'beforeData should be null');
    }
    PASS(
      'report CREATE',
      `history#${reportHistories[0].id} user_id=reporter`
    );

    // 2) 만료 해제 경로 — 트리거만, actor null, 이중 insert 없음
    const past = new Date(Date.now() - 60_000);
    await prisma.userStatusInfo.update({
      where: { userId: targetUser.id },
      data: {
        status: UserStatus.SUSPENDED,
        suspendedAt: past,
        suspendedUntil: past,
      },
    });
    // 위 UPDATE도 트리거 History를 남김 — 정리 목록에 넣음
    const suspendSetupHistories = await prisma.history.findMany({
      where: {
        tableName: 'user_statuses',
        tableRowId: targetUser.id,
      },
      select: { id: true },
    });
    historyIdsToDelete.push(...suspendSetupHistories.map((h) => h.id));

    const beforeReleaseCount = await prisma.history.count({
      where: {
        tableName: 'user_statuses',
        tableRowId: targetUser.id,
        operationType: HistoryAction.UPDATE,
      },
    });

    // ALS 없음(cron과 동일) — Service createHistory 루프 없음
    const releaseResult = await releaseExpiredSuspensions(new Date());
    if (!releaseResult.releasedUserIds.includes(targetUser.id)) {
      FAIL(
        'releaseExpiredSuspensions',
        `target not released: ${JSON.stringify(releaseResult)}`
      );
    }

    const afterReleaseHistories = await prisma.history.findMany({
      where: {
        tableName: 'user_statuses',
        tableRowId: targetUser.id,
        operationType: HistoryAction.UPDATE,
      },
      orderBy: { id: 'desc' },
    });
    historyIdsToDelete.push(...afterReleaseHistories.map((h) => h.id));

    const added = afterReleaseHistories.length - beforeReleaseCount;
    // setup UPDATE 1 + release UPDATE 1 = 증가분은 환경에 따라 beforeReleaseCount에 setup이 포함됨
    // release 직후 최신 1건을 검사
    const latestRelease = afterReleaseHistories[0];
    if (!latestRelease) {
      FAIL('expiry history', 'no UPDATE history after release');
    }
    if (latestRelease.userId !== null || latestRelease.adminUserId !== null) {
      FAIL(
        'expiry actor',
        `expected null actors, got user=${latestRelease.userId} admin=${latestRelease.adminUserId}`
      );
    }
    // 같은 시각대에 service+trigger 이중이면 동일 after가 2건 가까이 생김 → 방금 추가분이 1건인지
    const setupMaxId =
      suspendSetupHistories.length > 0
        ? Math.max(...suspendSetupHistories.map((h) => h.id))
        : 0;
    const justAdded = afterReleaseHistories.filter((h) => h.id > setupMaxId);
    // suspend setup이 extension으로 1건, release가 1건이어야 함
    if (justAdded.length !== 1) {
      FAIL(
        'expiry no double insert',
        `expected 1 new history after setup, got ${justAdded.length} (total UPDATE ${afterReleaseHistories.length}, added=${added})`
      );
    }
    PASS(
      'expiry cron path',
      `history#${latestRelease.id} actors=null, single insert`
    );

    // 3) 일반 CUD 샘플 — posts UPDATE before/after
    const post = await auditContextStorage.run(
      { userId: reporter.id },
      async () =>
        prisma.post.create({
          data: {
            userId: reporter.id,
            category: PostsCategory.ETC,
            title: marker,
            content: 'before-content',
          },
          select: { id: true },
        })
    );
    createdPostIds.push(post.id);

    await auditContextStorage.run({ userId: reporter.id }, async () =>
      prisma.post.update({
        where: { id: post.id },
        data: { content: 'after-content' },
      })
    );

    const postHistories = await prisma.history.findMany({
      where: { tableName: 'posts', tableRowId: String(post.id) },
      orderBy: { id: 'asc' },
    });
    historyIdsToDelete.push(...postHistories.map((h) => h.id));

    const createH = postHistories.find(
      (h) => h.operationType === HistoryAction.CREATE
    );
    const updateH = postHistories.find(
      (h) => h.operationType === HistoryAction.UPDATE
    );
    if (!createH || !updateH) {
      FAIL(
        'posts CUD',
        `need CREATE+UPDATE, got ${postHistories.map((h) => h.operationType).join(',')}`
      );
    }
    const postCreateHistory = createH!;
    const postUpdateHistory = updateH!;
    const before = postUpdateHistory.beforeData as { content?: string } | null;
    const after = postUpdateHistory.afterData as { content?: string } | null;
    if (before?.content !== 'before-content' || after?.content !== 'after-content') {
      FAIL(
        'posts before/after',
        `before=${before?.content} after=${after?.content}`
      );
    }
    if (postUpdateHistory.userId !== reporter.id) {
      FAIL(
        'posts actor',
        `expected ${reporter.id}, got ${postUpdateHistory.userId}`
      );
    }
    PASS(
      'posts CUD',
      `CREATE#${postCreateHistory.id} UPDATE#${postUpdateHistory.id} before/after ok`
    );

    // 4) skip_audit — 관리자 정지 경로: 트리거 스킵 + Service History 1건
    if (!admin) {
      console.log(
        '[SKIP] admin suspend path — admin_users row 없음 (create-admin 후 재실행)'
      );
    } else {
      const countBefore = await prisma.history.count({
        where: {
          tableName: 'user_statuses',
          tableRowId: reporter.id,
        },
      });

      await runWithManualAudit(() =>
        runAuditedTransaction(async (tx) => {
          const beforeStatus = await tx.userStatusInfo.findUnique({
            where: { userId: reporter.id },
          });
          const afterStatus = await tx.userStatusInfo.update({
            where: { userId: reporter.id },
            data: {
              status: UserStatus.SUSPENDED,
              suspendedAt: new Date(),
              suspendedUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
          });
          await createHistory(
            {
              userId: null,
              adminUserId: admin.id,
              tableName: 'user_statuses',
              tableRowId: reporter.id,
              operationType: HistoryAction.UPDATE,
              beforeData: {
                userId: beforeStatus?.userId,
                status: beforeStatus?.status,
              },
              afterData: {
                userId: afterStatus.userId,
                status: afterStatus.status,
              },
            },
            tx
          );
        })
      );

      const afterSkipHistories = await prisma.history.findMany({
        where: {
          tableName: 'user_statuses',
          tableRowId: reporter.id,
        },
        orderBy: { id: 'desc' },
      });
      historyIdsToDelete.push(...afterSkipHistories.map((h) => h.id));

      const addedSkip = afterSkipHistories.length - countBefore;
      if (addedSkip !== 1) {
        FAIL(
          'skip_audit single history',
          `expected +1 history, got +${addedSkip}`
        );
      }
      if (afterSkipHistories[0].adminUserId !== admin.id) {
        FAIL(
          'skip_audit admin actor',
          `expected adminUserId=${admin.id}, got ${afterSkipHistories[0].adminUserId}`
        );
      }
      PASS(
        'skip_audit admin suspend',
        `+1 history only, adminUserId=${admin.id}`
      );

      // 상태 원복 (skip 없이 트리거 1건 더 생길 수 있음 → 정리)
      await prisma.userStatusInfo.update({
        where: { userId: reporter.id },
        data: {
          status: UserStatus.ACTIVE,
          suspendedAt: null,
          suspendedUntil: null,
        },
      });
      const restoreHs = await prisma.history.findMany({
        where: { tableName: 'user_statuses', tableRowId: reporter.id },
        select: { id: true },
      });
      historyIdsToDelete.push(...restoreHs.map((h) => h.id));
    }

    // 5) 회귀 — 만료 대상 없을 때 cron 서비스가 깨지지 않음
    const emptyRelease = await releaseExpiredSuspensions(new Date());
    if (
      typeof emptyRelease.releasedCount !== 'number' ||
      !Array.isArray(emptyRelease.releasedUserIds)
    ) {
      FAIL('regression release shape', JSON.stringify(emptyRelease));
    }
    PASS(
      'regression releaseExpiredSuspensions',
      `releasedCount=${emptyRelease.releasedCount}`
    );

    console.log('\n=== all checks passed ===');
  } finally {
    // 정리 (histories → reports/posts → users). histories FK는 user/admin 참조
    const uniqueHistoryIds = [...new Set(historyIdsToDelete)];
    if (uniqueHistoryIds.length > 0) {
      await prisma.history.deleteMany({ where: { id: { in: uniqueHistoryIds } } });
    }
    // 유저 생성 시 생긴 histories도 정리
    await prisma.history.deleteMany({
      where: {
        OR: [
          { tableName: 'users', tableRowId: { in: [reporter.id, targetUser.id] } },
          {
            tableName: 'user_statuses',
            tableRowId: { in: [reporter.id, targetUser.id] },
          },
          ...(createdReportIds.length
            ? [
                {
                  tableName: 'user_reports',
                  tableRowId: {
                    in: createdReportIds.map(String),
                  },
                },
              ]
            : []),
          ...(createdPostIds.length
            ? [
                {
                  tableName: 'posts',
                  tableRowId: { in: createdPostIds.map(String) },
                },
              ]
            : []),
        ],
      },
    });

    if (createdReportIds.length > 0) {
      await prisma.userReport.deleteMany({
        where: { id: { in: createdReportIds } },
      });
    }
    if (createdPostIds.length > 0) {
      await prisma.post.deleteMany({ where: { id: { in: createdPostIds } } });
    }
    await prisma.userStatusInfo.deleteMany({
      where: { userId: { in: [reporter.id, targetUser.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [reporter.id, targetUser.id] } },
    });
    console.log('cleanup done');
  }
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
