import * as chatRepository from '../repositories/chat.repository';

/**
 * 유저의 전체·특정 방 미읽음 수를 계산한다.
 */
export const resolveUnreadPayload = async (userId: string, roomId: number) => {
  const roomFilters =
    await chatRepository.findActiveRoomFiltersByUserId(userId);
  const unreadByRoom = await chatRepository.findUnreadCountsByRooms(
    userId,
    roomFilters
  );

  let unreadCount = 0;
  for (const count of unreadByRoom.values()) {
    unreadCount += count;
  }

  return {
    unreadCount,
    roomId,
    roomUnreadCount: unreadByRoom.get(roomId) ?? 0,
  };
};
