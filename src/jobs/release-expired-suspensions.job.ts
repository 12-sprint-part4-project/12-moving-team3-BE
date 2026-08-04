import cron from 'node-cron';
import { releaseExpiredSuspensions } from '../services/user-status.service';

/**
 * 정지 기간이 만료된 회원을 ACTIVE로 되돌린다.
 * 상태 변경과 History 저장은 user-status.service에서 트랜잭션으로 처리한다.
 */
export const runReleaseExpiredSuspensionsJob = async (): Promise<void> => {
  try {
    const result = await releaseExpiredSuspensions();
    console.log(
      `[release-expired-suspensions] released=${result.releasedCount}`
    );
  } catch (error) {
    // job 실패가 서버 프로세스까지 죽이지 않도록 여기서 흡수한다.
    console.error('[release-expired-suspensions] failed', error);
  }
};

/**
 * 매일 00:05 Asia/Seoul 에 만료된 정지 자동 해제 실행
 */
export const startReleaseExpiredSuspensionsCron = (): void => {
  // minute hour day-of-month month day-of-week
  cron.schedule(
    '5 0 * * *',
    () => {
      // void 로 버리면 unhandled rejection 이 될 수 있어 catch로 한 번 더 감싼다.
      runReleaseExpiredSuspensionsJob().catch((error) => {
        console.error('[release-expired-suspensions] job failed', error);
      });
    },
    { timezone: 'Asia/Seoul' }
  );

  console.log(
    '[cron] release expired suspensions scheduled (00:05 Asia/Seoul)'
  );
};
