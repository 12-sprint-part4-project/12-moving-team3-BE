import cron from 'node-cron';
import * as notificationService from '../services/notification.service';

/**
 * NotificationOutbox claim → jobType 전략 → createMany 청크 → DONE/FAILED.
 * 제출 API는 enqueue만 하고, 실제 매칭 알림 발송은 이 워커가 담당한다.
 */
export const runNotificationOutboxJob = async (): Promise<void> => {
  await notificationService.processNotificationOutboxTick();
};

/**
 * 매분 Asia/Seoul + 부팅 직후 1회.
 * 매칭 알림 지연을 줄이려고 분 단위로 돌리고, 재시작 누락분은 boot catch-up.
 */
export const startNotificationOutboxCron = (): void => {
  const runSafely = (): void => {
    runNotificationOutboxJob().catch((error) => {
      console.error('[notification-outbox] job failed', error);
    });
  };

  // minute hour day-of-month month day-of-week
  cron.schedule('* * * * *', runSafely, { timezone: 'Asia/Seoul' });

  runSafely();

  console.log(
    '[cron] notification outbox scheduled (* * * * * Asia/Seoul) + boot catch-up'
  );
};
