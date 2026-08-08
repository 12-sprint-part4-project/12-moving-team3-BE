import type { EstimateRequestStatus } from '@prisma/client';

/**
 * 견적 요청이 종료된 상태 — 신규 방 생성·메시지 발송 차단.
 * 기존 방 목록/상세/이력 조회는 허용한다. (#246)
 */
const MESSAGING_BLOCKED_ESTIMATE_STATUSES: EstimateRequestStatus[] = [
  'EXPIRED',
  'CANCELED',
  'COMPLETED',
];

/**
 * 견적 요청 상태에 따라 채팅 이용(신규 방·메시지 발송) 가능 여부를 판단한다.
 * status가 없으면(COMMUNITY 등) 허용한다.
 */
export const isMessagingAllowedByEstimateStatus = (
  status: EstimateRequestStatus | null | undefined
): boolean => {
  if (!status) {
    return true;
  }

  return !MESSAGING_BLOCKED_ESTIMATE_STATUSES.includes(status);
};
