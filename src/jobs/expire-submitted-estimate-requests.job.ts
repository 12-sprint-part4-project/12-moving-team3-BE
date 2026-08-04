import cron from 'node-cron';
import * as estimateRequestRepository from '../repositories/estimate-request.repository';
import { startOfDayKst } from '../utils/date.util';

/**
 * SUBMITTED + moveDate < 오늘(KST) 인 견적 요청을 EXPIRED로 전환한다.
 * 이사일 다음 날 00:00부터 만료로 본다.
 */
export const runExpireSubmittedEstimateRequestsJob =
  async (): Promise<void> => {
    const todayStart = startOfDayKst(new Date());
    const count =
      await estimateRequestRepository.expireSubmittedEstimateRequestsPastMoveDate(
        todayStart
      );

    console.log(
      `[expire-submitted-estimate-requests] expired count=${count} (before ${todayStart.toISOString().slice(0, 10)})`
    );
  };

/**
 * 매일 00:00 Asia/Seoul 에 미확정(SUBMITTED) 견적 요청 만료 처리
 */
export const startExpireSubmittedEstimateRequestsCron = (): void => {
  // minute hour day-of-month month day-of-week
  cron.schedule(
    '0 0 * * *',
    () => {
      runExpireSubmittedEstimateRequestsJob().catch((error) => {
        console.error('[expire-submitted-estimate-requests] job failed', error);
      });
    },
    { timezone: 'Asia/Seoul' }
  );

  console.log(
    '[cron] expire submitted estimate requests scheduled (00:00 Asia/Seoul)'
  );
};
