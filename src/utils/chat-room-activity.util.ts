interface ChatRoomLastActivityParams {
  roomCreatedAt: Date;
  joinedAt: Date;
  lastMessageCreatedAt: Date | null;
}

interface ChatRoomActivitySortItem {
  roomId: number;
  lastActivityAt: string;
}

/**
 * 사용자 관점 채팅방 마지막 활동 시각.
 * - 방 생성(createdAt)
 * - 재참여(joinedAt)
 * - joinedAt 이후 마지막 메시지(createdAt)
 * 중 가장 최근 값을 사용한다.
 */
export const computeChatRoomLastActivityAt = (
  params: ChatRoomLastActivityParams
): Date => {
  const timestamps = [
    params.roomCreatedAt.getTime(),
    params.joinedAt.getTime(),
  ];

  if (params.lastMessageCreatedAt) {
    timestamps.push(params.lastMessageCreatedAt.getTime());
  }

  return new Date(Math.max(...timestamps));
};

/**
 * lastActivityAt ISO 문자열 내림차순, 동률 시 roomId 내림차순.
 */
export const compareChatRoomsByLastActivityDesc = (
  a: ChatRoomActivitySortItem,
  b: ChatRoomActivitySortItem
): number => {
  const byActivity = b.lastActivityAt.localeCompare(a.lastActivityAt);
  if (byActivity !== 0) {
    return byActivity;
  }

  return b.roomId - a.roomId;
};
