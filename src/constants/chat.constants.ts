import type { EstimateRequestStatus } from '@prisma/client';

/** 이사 완료(COMPLETED) 이후에는 신규 메시지 발송을 제한한다. */
const MESSAGING_BLOCKED_ESTIMATE_STATUSES: EstimateRequestStatus[] = [
  'COMPLETED',
];

/** 견적 요청 상태에 따라 채팅 메시지 발송 가능 여부를 판단한다. */
export const isMessagingAllowedByEstimateStatus = (
  status: EstimateRequestStatus | null | undefined
): boolean => {
  if (!status) {
    return true;
  }

  return !MESSAGING_BLOCKED_ESTIMATE_STATUSES.includes(status);
};
