import { runAuditedTransaction } from '../lib/audit-context';
import {
  activateUserStatusesByUserIds,
  findExpiredSuspendedStatuses,
} from '../repositories/user-status.repository';

/** 만료된 정지 자동 해제 결과 — 실제 ACTIVE로 바뀐 회원만 포함한다 */
export interface ReleaseExpiredSuspensionsResult {
  releasedUserIds: string[];
  releasedCount: number;
}

/**
 * 정지 기간이 끝난 회원을 ACTIVE로 되돌린다.
 * History는 Service에서 쓰지 않고 user_statuses UPDATE 트리거가 남긴다 (actor null).
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

    const candidateUserIds = expiredStatuses.map((row) => row.userId);

    // RETURNING으로 실제 갱신된 row만 받아, 조회 직후 바뀐 회원은 제외한다.
    const updatedStatuses = await activateUserStatusesByUserIds(
      candidateUserIds,
      now,
      tx
    );

    const releasedUserIds = updatedStatuses.map((row) => row.userId);

    return {
      releasedUserIds,
      releasedCount: releasedUserIds.length,
    };
  });
};
