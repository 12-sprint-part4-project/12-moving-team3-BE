import type { MessageType, UserType } from '@prisma/client';
import type { ChatFilterAction, ChatFilterReasonCode } from '../dtos/chat.dto';
import type { Server, Socket } from 'socket.io';
import type { ApiUserType } from '../schemas/auth.schema';

export interface SocketAuthUser {
  userId: string;
  userType: ApiUserType;
}

export interface ChatSocketData {
  user: SocketAuthUser;
}

export type ChatServer = Server<
  ChatClientToServerEvents,
  ChatServerToClientEvents,
  Record<string, never>,
  ChatSocketData
>;

export type ChatSocket = Socket<
  ChatClientToServerEvents,
  ChatServerToClientEvents,
  Record<string, never>,
  ChatSocketData
>;

export interface ChatJoinPayload {
  roomId: number;
}

export interface ChatLeavePayload {
  roomId: number;
}

export interface ChatMessagePayload {
  roomId: number;
  message: {
    messageId: number;
    senderId: string;
    senderUserType: UserType;
    messageType: MessageType;
    content: string;
    isFiltered: boolean;
    /** 전송 직후 payload에만 포함 (#432). 이력 조회 소켓 replay 없음 */
    filterAction?: ChatFilterAction;
    filterReasonCodes?: ChatFilterReasonCode[];
    attachments: string[];
    createdAt: string;
  };
}

export interface ChatReadPayload {
  roomId: number;
  readerId: string;
  lastReadMessageId: number;
  readAt: string;
}

export interface ChatUnreadPayload {
  unreadCount: number;
  roomId?: number;
  roomUnreadCount?: number;
}

/** 상대방 나가기 알림 (#314) */
export interface ChatPartnerLeftPayload {
  roomId: number;
  leftAt: string;
}

export interface ChatSocketErrorPayload {
  code: string;
  message: string;
}

export interface ChatClientToServerEvents {
  'chat:join': (
    payload: ChatJoinPayload,
    ack?: (response: { ok: boolean }) => void
  ) => void;
  'chat:leave': (
    payload: ChatLeavePayload,
    ack?: (response: { ok: boolean }) => void
  ) => void;
}

export interface ChatServerToClientEvents {
  'chat:message': (payload: ChatMessagePayload) => void;
  'chat:read': (payload: ChatReadPayload) => void;
  'chat:unread': (payload: ChatUnreadPayload) => void;
  'chat:partner-left': (payload: ChatPartnerLeftPayload) => void;
  'chat:error': (payload: ChatSocketErrorPayload) => void;
}
