import cron from 'node-cron';
import * as estimateRequestRepository from '../repositories/estimate-request.repository';
import * as notificationService from '../services/notification.service';
import { startOfDayKst } from '../utils/date.util';

/**
 * 이사일(moveDate)이 지난 견적 요청 status를 일괄 전환한다.
 * - SUBMITTED → EXPIRED
 * - CONFIRMED → COMPLETED
 * 이사일 다음 날 00:00(KST)부터 경과로 본다.
 * 한쪽 실패해도 다른 쪽은 계속 시도한다.
 * COMPLETED 전환 후·재실행 시 REVIEW_REQUESTED 미발송분을 catch-up 한다.
 */
export const runEstimateRequestStatusChangeJob = async (): Promise<void> => {
  const todayStart = startOfDayKst(new Date());
  const beforeDate = todayStart.toISOString().slice(0, 10);

  try {
    const expiredCount =
      await estimateRequestRepository.expireSubmittedEstimateRequestsPastMoveDate(
        todayStart
      );
    console.log(
      `[estimate-request-status-change] expired count=${expiredCount} (before ${beforeDate})`
    );
  } catch (error) {
    console.error('[estimate-request-status-change] expire step failed', error);
  }

  try {
    const completedCount =
      await estimateRequestRepository.completeConfirmedEstimateRequestsPastMoveDate(
        todayStart
      );
    console.log(
      `[estimate-request-status-change] completed count=${completedCount} (before ${beforeDate})`
    );
  } catch (error) {
    console.error(
      '[estimate-request-status-change] complete step failed',
      error
    );
  }

  // COMPLETED 직후 + 이전 누락분 — 이미 보낸 (receiver, type, estimateRequestId) 는 skip
  try {
    await notificationService.notifyMissingReviewRequestedForCompletedMoves();
  } catch (error) {
    console.error(
      '[estimate-request-status-change] review-requested catch-up failed',
      error
    );
  }
};

/**
 * 매일 00:00 Asia/Seoul 에 이사일 경과 견적 요청 status 전환
 * 서버 기동 시에도 한 번 실행
 */
export const startEstimateRequestStatusChangeCron = (): void => {
  const runSafely = (): void => {
    runEstimateRequestStatusChangeJob().catch((error) => {
      console.error('[estimate-request-status-change] job failed', error);
    });
  };

  // minute hour day-of-month month day-of-week
  cron.schedule('0 0 * * *', runSafely, { timezone: 'Asia/Seoul' });

  // 기동 직후 1회 실행 (자정을 놓친 건 보정)
  runSafely();

  console.log(
    '[cron] estimate request status change scheduled (00:00 Asia/Seoul)'
  );
};
