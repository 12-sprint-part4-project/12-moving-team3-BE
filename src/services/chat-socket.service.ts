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
import { resolveUnreadPayload } from '../utils/chat-unread.util';

interface ChatMessageCreatedParams {
  roomId: number;
  senderId: string;
  message: ChatMessagePayload['message'];
}

interface ChatRoomReadParams {
  roomId: number;
  readerId: string;
  lastReadMessageId: number;
  readAt: string;
  partnerIds: string[];
}

/**
 * 새 메시지를 참여자에게 알리고, 수신자 미읽음 뱃지를 갱신한다.
 * - 메시지는 유저 룸으로만 전송(방 join 여부와 무관, 중복 방지)
 * - Socket.IO 미초기화 시 no-op
 * - 알림 실패는 REST 응답에 영향을 주지 않도록 내부에서 처리한다
 */
export const emitChatMessageCreated = async (
  params: ChatMessageCreatedParams
): Promise<void> => {
  try {
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

      if (participantId === params.senderId) {
        continue;
      }

      const unread = await resolveUnreadPayload(participantId, params.roomId);
      io.to(toUserSocketRoom(participantId)).emit(
        CHAT_SOCKET_SERVER_EVENTS.UNREAD,
        unread
      );
    }
  } catch (error) {
    console.error('[chat-socket] emitChatMessageCreated failed', error);
  }
};

/**
 * 읽음 상태를 상대에게 알리고, 읽은 유저의 해당 방 미읽음을 0으로 맞춘다.
 * Socket.IO 미초기화 시 no-op.
 * 알림 실패는 REST 응답에 영향을 주지 않도록 내부에서 처리한다.
 */
export const emitChatRoomRead = async (
  params: ChatRoomReadParams
): Promise<void> => {
  try {
    const io = getChatIo();
    if (!io) {
      return;
    }

    const payload: ChatReadPayload = {
      roomId: params.roomId,
      readerId: params.readerId,
      lastReadMessageId: params.lastReadMessageId,
      readAt: params.readAt,
    };

    for (const partnerId of params.partnerIds) {
      io.to(toUserSocketRoom(partnerId)).emit(
        CHAT_SOCKET_SERVER_EVENTS.READ,
        payload
      );
    }

    // advanceReadStatus 이후이므로 roomUnreadCount는 0이다.
    const unread = await resolveUnreadPayload(params.readerId, params.roomId);
    io.to(toUserSocketRoom(params.readerId)).emit(
      CHAT_SOCKET_SERVER_EVENTS.UNREAD,
      {
        ...unread,
        roomUnreadCount: 0,
      }
    );
  } catch (error) {
    console.error('[chat-socket] emitChatRoomRead failed', error);
  }
};
