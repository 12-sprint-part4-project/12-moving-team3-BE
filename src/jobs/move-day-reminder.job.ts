import cron from 'node-cron';
import { toRouteRegionLabel } from '../constants/notification.templates';
import * as notificationRepository from '../repositories/notification.repository';
import * as notificationService from '../services/notification.service';
import { isAtOrAfterHourKst, startOfDayKst } from '../utils/date.util';

/**
 * Asia/Seoul 기준 내일(UTC Date, @db.Date 비교용)
 */
const getTomorrowKstUtcDate = (now = new Date()): Date => {
  const today = startOfDayKst(now);
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return tomorrow;
};

/**
 * CONFIRMED + moveDate=내일 인 요청에 대해
 * 고객/확정기사에게 이사 전날 리마인더를 보낸다.
 * 동일 (receiverId, type, estimateRequestId) 는 skip.
 */
export const runMoveDayReminderJob = async (): Promise<void> => {
  const tomorrow = getTomorrowKstUtcDate();
  const targets =
    await notificationRepository.findConfirmedMovesOnDate(tomorrow);

  for (const request of targets) {
    try {
      const departureRegion = toRouteRegionLabel(request.departureAddress);
      const arrivalRegion = toRouteRegionLabel(request.arrivalAddress);
      const routePayload = { departureRegion, arrivalRegion };

      await notificationService.createMoveDayReminderIfAbsent({
        receiverId: request.userId,
        type: 'CUSTOMER_MOVE_DAY_REMINDER',
        estimateRequestId: request.id,
        payload: routePayload,
      });

      const moverId = request.confirmedQuote?.moverId;
      if (!moverId) {
        continue;
      }

      await notificationService.createMoveDayReminderIfAbsent({
        receiverId: moverId,
        type: 'MOVER_MOVE_DAY_REMINDER',
        estimateRequestId: request.id,
        payload: routePayload,
      });
    } catch (error) {
      console.error(
        `[move-day-reminder] estimateRequestId=${request.id} failed`,
        error
      );
    }
  }
};

/**
 * 매일 09:00 Asia/Seoul 에 이사 전날 리마인더 실행.
 * 부팅 직후 1회 catch-up — 09:00 이후 배포/재시작으로 당일 cron 이 빠진 경우를 보정.
 * 이미 보낸 (receiverId, type, estimateRequestId) 는 createMoveDayReminderIfAbsent 가 skip.
 */
export const startMoveDayReminderCron = (): void => {
  // 부팅 catch-up: KST 09:00 이후에만 — 그 전이면 당일 cron이 아직 남았으므로 skip
  if (isAtOrAfterHourKst(9)) {
    runMoveDayReminderJob().catch((error) => {
      console.error('[move-day-reminder] boot catch-up failed', error);
    });
  }

  // minute hour day-of-month month day-of-week
  cron.schedule(
    '0 9 * * *',
    () => {
      // void 로 버리면 findConfirmedMovesOnDate 실패 시 unhandled rejection 이 된다
      runMoveDayReminderJob().catch((error) => {
        console.error('[move-day-reminder] job failed', error);
      });
    },
    { timezone: 'Asia/Seoul' }
  );

  console.log(
    '[cron] move-day reminder scheduled (09:00 Asia/Seoul) + boot catch-up(>=09:00 KST)'
  );
};
