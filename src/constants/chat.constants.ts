import type {
  ChatRoomType,
  EstimateRequestStatus,
  QuoteStatus,
} from '@prisma/client';

/** 채팅 상대 표시명 해석에 쓰는 name/nickname */
export interface ChatCounterpartNameSource {
  name: string | null;
  nickname: string | null;
}

/**
 * 채팅 상대 표시명.
 * COMMUNITY는 닉네임(없으면 name), 견적(GENERAL/DESIGNATED)은 이름. 둘 다 없으면 '상대방'.
 * 알림 CHAT_ROOM_OPENED와 동일한 규칙이다. (#299)
 */
export const resolveChatCounterpartDisplayName = (
  roomType: ChatRoomType,
  user: ChatCounterpartNameSource
): string => {
  if (roomType === 'COMMUNITY') {
    return user.nickname || user.name || '상대방';
  }

  return user.name || '상대방';
};

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

/** 채팅방 메시지 발송 가능 여부 판정 입력 */
export interface ChatRoomMessagingStatusParams {
  estimateRequestStatus?: EstimateRequestStatus | null;
  quoteStatus?: QuoteStatus | null;
}

/**
 * 견적 요청·연결된 견적 상태를 모두 보고 메시지 발송 가능 여부를 판단한다.
 * - 요청이 EXPIRED/CANCELED/COMPLETED면 차단
 * - 연결된 견적이 REJECTED면 차단 (지정 반려 등)
 * - COMMUNITY 등 estimate/quote 없으면 허용
 */
export const isMessagingAllowedForChatRoom = (
  params: ChatRoomMessagingStatusParams
): boolean => {
  if (!isMessagingAllowedByEstimateStatus(params.estimateRequestStatus)) {
    return false;
  }

  if (params.quoteStatus === 'REJECTED') {
    return false;
  }

  return true;
};

/**
 * 채팅방 quoteId 연결 결과.
 * - bind: 미연결(null) → 최초 연결
 * - already: 동일 quoteId (변경 없음)
 * - conflict: 다른 quoteId로 바꾸려 함 (불허)
 */
export type ChatRoomQuoteBindResult = 'bind' | 'already' | 'conflict';

/**
 * 채팅방의 quoteId는 같은 방에서 교체하지 않는다.
 * null일 때만 최초 연결하고, 이미 다른 견적이 있으면 conflict.
 */
export const resolveChatRoomQuoteBind = (
  currentQuoteId: number | null,
  nextQuoteId: number
): ChatRoomQuoteBindResult => {
  if (currentQuoteId == null) {
    return 'bind';
  }

  if (currentQuoteId === nextQuoteId) {
    return 'already';
  }

  return 'conflict';
};
