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

/**
 * 사용자를 SUSPENDED로 저장한다.
 * UserStatusInfo가 없으면 생성하고, 있으면 정지 상태로 갱신한다.
 *
 * 사전 조회 없이 INSERT … ON CONFLICT로 원자적으로 처리한다.
 * - ACTIVE(또는 신규): 전달받은 suspendedUntil 사용
 * - SUSPENDED: 기존·신규 종료 시각 중 더 늦은 값 유지 (기존이 null이면 신규)
 * - suspendedAt: 항상 전달받은 처리 시각
 *
 * admin-member의 upsertAdminMemberStatus와 달리 장기 정지를 단축하지 않는다.
 * 날짜는 Service가 계산해 넘긴다 — Repository는 new Date()·트랜잭션을 만들지 않는다.
 */
export const upsertSuspendedUserStatus = async (
  data: SuspendUserStatusInput,
  db: DbClient = prisma
): Promise<SuspendedUserStatusRow> => {
  // PK(user_id) 충돌 시 한 문장으로 갱신해 동시 정지 요청이 기간을 짧게 덮어쓰지 않게 한다.
  const rows = await db.$queryRaw<SuspendedUserStatusRow[]>`
    INSERT INTO user_statuses (user_id, status, suspended_at, suspended_until)
    VALUES (
      ${data.userId}::uuid,
      'SUSPENDED'::"UserStatus",
      ${data.suspendedAt},
      ${data.suspendedUntil}
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      status = 'SUSPENDED'::"UserStatus",
      suspended_at = EXCLUDED.suspended_at,
      suspended_until = CASE
        WHEN user_statuses.status = 'SUSPENDED'::"UserStatus"
          AND user_statuses.suspended_until IS NOT NULL
          AND user_statuses.suspended_until > EXCLUDED.suspended_until
        THEN user_statuses.suspended_until
        ELSE EXCLUDED.suspended_until
      END
    RETURNING
      user_id AS "userId",
      status,
      suspended_at AS "suspendedAt",
      suspended_until AS "suspendedUntil"
  `;

  const row = rows[0];
  if (!row) {
    // RETURNING이 비는 경우는 DB 이상으로 보고 호출부에 숨기지 않는다.
    throw new Error('Failed to upsert suspended user status');
  }

  return row;
};
