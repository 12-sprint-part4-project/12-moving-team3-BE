import { Prisma, UserStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';

type DbClient = typeof prisma | Prisma.TransactionClient;

/** 만료된 정지 상태 스냅샷 — History before/after Data로 사용한다 */
export interface ExpiredSuspendedStatusRow {
  userId: string;
  status: UserStatus;
  suspendedAt: Date | null;
  suspendedUntil: Date | null;
}

/**
 * SUSPENDED 이면서 suspendedUntil이 now 이하인 상태를 조회한다.
 * suspendedUntil이 null이거나 미래인 row는 포함하지 않는다.
 */
export const findExpiredSuspendedStatuses = async (
  now: Date = new Date(),
  db: DbClient = prisma
): Promise<ExpiredSuspendedStatusRow[]> => {
  return db.userStatusInfo.findMany({
    where: {
      status: UserStatus.SUSPENDED,
      suspendedUntil: {
        lte: now,
      },
    },
    select: {
      userId: true,
      status: true,
      suspendedAt: true,
      suspendedUntil: true,
    },
  });
};

/**
 * 아직 만료된 정지 상태인 회원만 ACTIVE로 바꾸고, 실제 변경된 row를 반환한다.
 * 조회 직후 상태가 바뀐 row는 WHERE로 걸러 History/결과와 어긋나지 않게 한다.
 */
export const activateUserStatusesByUserIds = async (
  userIds: string[],
  now: Date,
  db: DbClient = prisma
): Promise<ExpiredSuspendedStatusRow[]> => {
  if (userIds.length === 0) {
    return [];
  }

  const userIdParams = Prisma.join(
    userIds.map((userId) => Prisma.sql`${userId}::uuid`)
  );

  return db.$queryRaw<ExpiredSuspendedStatusRow[]>`
    UPDATE user_statuses
    SET
      status = 'ACTIVE'::"UserStatus",
      suspended_at = NULL,
      suspended_until = NULL
    WHERE user_id IN (${userIdParams})
      AND status = 'SUSPENDED'::"UserStatus"
      AND suspended_until <= ${now}
    RETURNING
      user_id AS "userId",
      status,
      suspended_at AS "suspendedAt",
      suspended_until AS "suspendedUntil"
  `;
};
