import {
  CHAT_SOCKET_CLIENT_EVENTS,
  CHAT_SOCKET_SERVER_EVENTS,
  toChatSocketRoom,
  toUserSocketRoom,
} from '../constants/chat-socket.constants';
import * as chatRepository from '../repositories/chat.repository';
import { resolveUnreadPayload } from '../utils/chat-unread.util';
import type { ChatSocket } from './socket.types';

const isPositiveInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1;

/**
 * 채팅 소켓 연결 시 유저 룸 참가 및 join/leave 핸들러를 등록한다.
 */
export const registerChatSocketHandlers = (socket: ChatSocket) => {
  const { userId } = socket.data.user;

  void socket.join(toUserSocketRoom(userId));

  socket.on(CHAT_SOCKET_CLIENT_EVENTS.JOIN, async (payload, ack) => {
    try {
      if (!isPositiveInt(payload?.roomId)) {
        socket.emit(CHAT_SOCKET_SERVER_EVENTS.ERROR, {
          code: 'INVALID_REQUEST',
          message: 'roomId가 올바르지 않습니다.',
        });
        ack?.({ ok: false });
        return;
      }

      const roomId = payload.roomId;
      const participation = await chatRepository.findActiveParticipation(
        roomId,
        userId
      );

      if (!participation) {
        socket.emit(CHAT_SOCKET_SERVER_EVENTS.ERROR, {
          code: 'FORBIDDEN',
          message: '채팅방에 참여할 권한이 없습니다.',
        });
        ack?.({ ok: false });
        return;
      }

      await socket.join(toChatSocketRoom(roomId));

      // 방 진입 시 해당 방 미읽음 UI를 0으로 맞춘다. DB 읽음은 REST /read가 담당한다.
      const base = await resolveUnreadPayload(userId, roomId);
      socket.emit(CHAT_SOCKET_SERVER_EVENTS.UNREAD, {
        roomId,
        roomUnreadCount: 0,
        unreadCount: Math.max(0, base.unreadCount - base.roomUnreadCount),
      });

      ack?.({ ok: true });
    } catch {
      socket.emit(CHAT_SOCKET_SERVER_EVENTS.ERROR, {
        code: 'INTERNAL_ERROR',
        message: '채팅방 입장에 실패했습니다.',
      });
      ack?.({ ok: false });
    }
  });

  socket.on(CHAT_SOCKET_CLIENT_EVENTS.LEAVE, (payload, ack) => {
    if (!isPositiveInt(payload?.roomId)) {
      ack?.({ ok: false });
      return;
    }

    void socket.leave(toChatSocketRoom(payload.roomId));
    ack?.({ ok: true });
  });
};
