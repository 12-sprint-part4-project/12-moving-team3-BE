import { HistoryAction, Prisma } from '@prisma/client';
import { runAuditedTransaction } from '../lib/audit-context';
import { createHistory } from '../repositories/history.repository';
import {
  activateUserStatusesByUserIds,
  findExpiredSuspendedStatuses,
  type ExpiredSuspendedStatusRow,
} from '../repositories/user-status.repository';

/** History.tableName — UserStatusInfo @@map("user_statuses")와 동일하게 맞춘다 */
const USER_STATUS_TABLE_NAME = 'user_statuses';

/** 만료된 정지 자동 해제 결과 — 실제 ACTIVE로 바뀐 회원만 포함한다 */
export interface ReleaseExpiredSuspensionsResult {
  releasedUserIds: string[];
  releasedCount: number;
}

/**
 * History Json 컬럼용 스냅샷.
 * Prisma Json은 Date를 그대로 받지 않으므로 ISO 문자열로 정규화한다.
 */
const toStatusHistoryJson = (
  row: ExpiredSuspendedStatusRow
): Prisma.InputJsonValue => ({
  userId: row.userId,
  status: row.status,
  suspendedAt: row.suspendedAt?.toISOString() ?? null,
  suspendedUntil: row.suspendedUntil?.toISOString() ?? null,
});

/**
 * 정지 기간이 끝난 회원을 ACTIVE로 되돌리고, 실제 변경된 회원만 History를 남긴다.
 * 상태 변경과 이력 저장은 같은 트랜잭션에서 처리한다.
 */
export const releaseExpiredSuspensions = async (
  now: Date = new Date()
): Promise<ReleaseExpiredSuspensionsResult> => {
  return runAuditedTransaction(async (tx) => {
    const expiredStatuses = await findExpiredSuspendedStatuses(now, tx);

    if (expiredStatuses.length === 0) {
      return {
        releasedUserIds: [],
        releasedCount: 0,
      };
    }

    const beforeByUserId = new Map(
      expiredStatuses.map((row) => [row.userId, row])
    );
    const candidateUserIds = expiredStatuses.map((row) => row.userId);

    // RETURNING으로 실제 갱신된 row만 받아, 조회 직후 바뀐 회원은 제외한다.
    const updatedStatuses = await activateUserStatusesByUserIds(
      candidateUserIds,
      now,
      tx
    );

    // 시스템 자동 해제 — actor(userId/adminUserId)는 null, 대상은 tableRowId로 식별한다.
    for (const afterData of updatedStatuses) {
      const beforeData = beforeByUserId.get(afterData.userId);

      if (!beforeData) {
        continue;
      }

      await createHistory(
        {
          userId: null,
          adminUserId: null,
          tableName: USER_STATUS_TABLE_NAME,
          tableRowId: afterData.userId,
          operationType: HistoryAction.UPDATE,
          beforeData: toStatusHistoryJson(beforeData),
          afterData: toStatusHistoryJson(afterData),
        },
        tx
      );
    }

    const releasedUserIds = updatedStatuses.map((row) => row.userId);

    return {
      releasedUserIds,
      releasedCount: releasedUserIds.length,
    };
  });
};
