import {
  CHAT_SOCKET_SERVER_EVENTS,
  toUserSocketRoom,
} from '../constants/chat-socket.constants';
import * as chatRepository from '../repositories/chat.repository';
import { getChatIo } from '../sockets';
import type {
  ChatMessagePayload,
  ChatReadPayload,
} from '../sockets/socket.types';

/**
 * 유저의 전체·특정 방 미읽음 수를 계산한다.
 */
const resolveUnreadPayload = async (userId: string, roomId: number) => {
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

/**
 * 새 메시지를 참여자에게 알리고, 수신자 미읽음 뱃지를 갱신한다.
 * - 메시지는 유저 룸으로만 전송(방 join 여부와 무관, 중복 방지(PC + 모바일))) 
 * - Socket.IO 미초기화 시 no-op
 */
export const emitChatMessageCreated = async (params: {
  roomId: number;
  senderId: string;
  message: ChatMessagePayload['message'];
}): Promise<void> => {
  const io = getChatIo();
  if (!io) {
    return;
  }

  const payload: ChatMessagePayload = {
    roomId: params.roomId,
    message: params.message,
  };

  const participantIds = await chatRepository.findActiveParticipantIds(
    params.roomId
  );

  for (const participantId of participantIds) {
    io.to(toUserSocketRoom(participantId)).emit(
      CHAT_SOCKET_SERVER_EVENTS.MESSAGE,
      payload
    );

    // 보낸 사람은 미읽음 제외 
    if (participantId === params.senderId) {
      continue;
    }

    const unread = await resolveUnreadPayload(participantId, params.roomId);
    io.to(toUserSocketRoom(participantId)).emit(
      CHAT_SOCKET_SERVER_EVENTS.UNREAD,
      unread
    );
  }
};

/**
 * 읽음 상태를 상대에게 알리고, 읽은 유저의 해당 방 미읽음을 0으로 맞춘다.
 * Socket.IO 미초기화 시 no-op.
 */
export const emitChatRoomRead = async (params: {
  roomId: number;
  readerId: string;
  lastReadMessageId: number;
  partnerIds: string[];
}): Promise<void> => {
  const io = getChatIo();
  if (!io) {
    return;
  }

  const payload: ChatReadPayload = {
    roomId: params.roomId,
    readerId: params.readerId,
    lastReadMessageId: params.lastReadMessageId,
  };

  for (const partnerId of params.partnerIds) {
    io.to(toUserSocketRoom(partnerId)).emit(
      CHAT_SOCKET_SERVER_EVENTS.READ,
      payload
    );
  }

  const roomFilters = await chatRepository.findActiveRoomFiltersByUserId(
    params.readerId
  );
  const unreadByRoom = await chatRepository.findUnreadCountsByRooms(
    params.readerId,
    roomFilters
  );

  let unreadCount = 0;
  for (const count of unreadByRoom.values()) {
    unreadCount += count;
  }

  io.to(toUserSocketRoom(params.readerId)).emit(
    CHAT_SOCKET_SERVER_EVENTS.UNREAD,
    {
      roomId: params.roomId,
      roomUnreadCount: 0,
      unreadCount,
    }
  );
};
