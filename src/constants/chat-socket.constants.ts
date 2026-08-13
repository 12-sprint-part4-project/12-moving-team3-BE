/** 클라이언트 → 서버 이벤트 */
export const CHAT_SOCKET_CLIENT_EVENTS = {
  JOIN: 'chat:join',
  LEAVE: 'chat:leave',
} as const;

/** 서버 → 클라이언트 이벤트 */
export const CHAT_SOCKET_SERVER_EVENTS = {
  MESSAGE: 'chat:message',
  READ: 'chat:read',
  UNREAD: 'chat:unread',
  /** 상대가 방을 나감 (#314). 클라이언트 chat:leave(방 소켓 퇴장)와 별개 */
  PARTNER_LEFT: 'chat:partner-left',
  ERROR: 'chat:error',
} as const;

/** 유저 개인 룸 — 메시지·뱃지 타겟팅 */
export const toUserSocketRoom = (userId: string) => `user:${userId}`;

/** 채팅방 룸 — 방 진입(join) 후 실시간 수신 */
export const toChatSocketRoom = (roomId: number) => `chat:room:${roomId}`;
