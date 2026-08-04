import {
  activateUserStatusesByUserIds,
  findExpiredSuspendedStatuses,
} from '../repositories/user-status.repository';

/** 만료된 정지 자동 해제 결과 — 다음 History 작업에서 userId별 이력을 남기기 쉽게 한다 */
export interface ReleaseExpiredSuspensionsResult {
  releasedUserIds: string[];
  releasedCount: number;
}

/**
 * 정지 기간이 끝난 회원을 ACTIVE로 되돌린다.
 * 스케줄러 등록·History 저장은 후속 작업에서 연결한다.
 */
export const releaseExpiredSuspensions = async (
  now: Date = new Date()
): Promise<ReleaseExpiredSuspensionsResult> => {
  const expiredStatuses = await findExpiredSuspendedStatuses(now);
  const releasedUserIds = expiredStatuses.map((row) => row.userId);

  if (releasedUserIds.length === 0) {
    return {
      releasedUserIds: [],
      releasedCount: 0,
    };
  }

  await activateUserStatusesByUserIds(releasedUserIds);

  return {
    releasedUserIds,
    releasedCount: releasedUserIds.length,
  };
};
