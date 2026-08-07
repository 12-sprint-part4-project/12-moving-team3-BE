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

/** 정지 저장 입력 — 7일 등 기간 계산은 Service가 하고, Repository는 전달값을 저장한다 */
export interface SuspendUserStatusInput {
  userId: string;
  suspendedAt: Date;
  suspendedUntil: Date;
}

/** 정지 저장 결과 — admin-member StatusRow와 동일한 최소 필드 */
export type SuspendedUserStatusRow = ExpiredSuspendedStatusRow;

const suspendedUserStatusSelect = {
  userId: true,
  status: true,
  suspendedAt: true,
  suspendedUntil: true,
} satisfies Prisma.UserStatusInfoSelect;

/**
 * 기존 종료 시각과 새 종료 시각 중 더 늦은 값을 고른다.
 * 이미 더 긴 정지가 있으면 신고 처리의 7일이 그 기간을 단축하지 않게 한다.
 */
const resolveSuspendedUntil = (
  existingUntil: Date | null | undefined,
  nextUntil: Date
): Date => {
  if (existingUntil && existingUntil > nextUntil) {
    return existingUntil;
  }

  return nextUntil;
};

/**
 * 사용자를 SUSPENDED로 저장한다.
 * UserStatusInfo가 없으면 생성하고, 있으면 정지 상태로 갱신한다.
 *
 * admin-member의 upsertAdminMemberStatus와 달리 suspendedUntil은 더 늦은 쪽을 유지한다.
 * (회원 수동 정지는 전달값을 그대로 덮어쓰고, 신고 정지는 기존 장기 정지를 보존한다.)
 *
 * 날짜는 Service가 계산해 넘긴다 — Repository는 new Date()를 만들지 않는다.
 */
export const upsertSuspendedUserStatus = async (
  data: SuspendUserStatusInput,
  db: DbClient = prisma
): Promise<SuspendedUserStatusRow> => {
  // create 경로에서도 기간 보존 규칙을 쓰려면 기존 row를 먼저 읽는다.
  const existing = await db.userStatusInfo.findUnique({
    where: { userId: data.userId },
    select: { suspendedUntil: true },
  });

  const suspendedUntil = resolveSuspendedUntil(
    existing?.suspendedUntil,
    data.suspendedUntil
  );

  return db.userStatusInfo.upsert({
    where: { userId: data.userId },
    create: {
      userId: data.userId,
      status: UserStatus.SUSPENDED,
      suspendedAt: data.suspendedAt,
      suspendedUntil,
    },
    update: {
      status: UserStatus.SUSPENDED,
      suspendedAt: data.suspendedAt,
      suspendedUntil,
    },
    select: suspendedUserStatusSelect,
  });
};
