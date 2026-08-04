import { Prisma, UserStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';

type DbClient = typeof prisma | Prisma.TransactionClient;

/** 만료된 정지 상태 스냅샷 — History beforeData로 사용한다 */
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
 * 지정한 회원들의 계정 상태를 ACTIVE로 되돌린다.
 * 조회 직후 상태가 바뀐 row는 건드리지 않도록 SUSPENDED 조건을 유지한다.
 */
export const activateUserStatusesByUserIds = async (
  userIds: string[],
  db: DbClient = prisma
): Promise<number> => {
  if (userIds.length === 0) {
    return 0;
  }

  const { count } = await db.userStatusInfo.updateMany({
    where: {
      userId: { in: userIds },
      status: UserStatus.SUSPENDED,
    },
    data: {
      status: UserStatus.ACTIVE,
      suspendedAt: null,
      suspendedUntil: null,
    },
  });

  return count;
};
