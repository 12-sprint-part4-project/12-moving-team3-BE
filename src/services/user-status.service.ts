import { HistoryAction, Prisma, UserStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { createHistory } from '../repositories/history.repository';
import {
  activateUserStatusesByUserIds,
  findExpiredSuspendedStatuses,
  type ExpiredSuspendedStatusRow,
} from '../repositories/user-status.repository';

/** History.tableName — UserStatusInfo @@map("user_statuses")와 동일하게 맞춘다 */
const USER_STATUS_TABLE_NAME = 'user_statuses';

/** 만료된 정지 자동 해제 결과 */
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
 * 정지 기간이 끝난 회원을 ACTIVE로 되돌리고, 회원별 History를 남긴다.
 * 상태 변경과 이력 저장은 같은 트랜잭션에서 처리한다.
 */
export const releaseExpiredSuspensions = async (
  now: Date = new Date()
): Promise<ReleaseExpiredSuspensionsResult> => {
  return prisma.$transaction(async (tx) => {
    const expiredStatuses = await findExpiredSuspendedStatuses(now, tx);
    const releasedUserIds = expiredStatuses.map((row) => row.userId);

    if (releasedUserIds.length === 0) {
      return {
        releasedUserIds: [],
        releasedCount: 0,
      };
    }

    await activateUserStatusesByUserIds(releasedUserIds, tx);

    // 시스템 자동 해제 — actor(userId/adminUserId)는 null, 대상은 tableRowId로 식별한다.
    for (const beforeData of expiredStatuses) {
      const afterData: ExpiredSuspendedStatusRow = {
        userId: beforeData.userId,
        status: UserStatus.ACTIVE,
        suspendedAt: null,
        suspendedUntil: null,
      };

      await createHistory(
        {
          userId: null,
          adminUserId: null,
          tableName: USER_STATUS_TABLE_NAME,
          tableRowId: beforeData.userId,
          operationType: HistoryAction.UPDATE,
          beforeData: toStatusHistoryJson(beforeData),
          afterData: toStatusHistoryJson(afterData),
        },
        tx
      );
    }

    return {
      releasedUserIds,
      releasedCount: releasedUserIds.length,
    };
  });
};
