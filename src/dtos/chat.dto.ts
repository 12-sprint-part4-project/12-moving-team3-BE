import type {
  ChatRoomType,
  MessageType,
  MoveType,
  QuoteStatus,
  UserType,
} from '@prisma/client';

export interface CreateChatRoomResult {
  status: 200 | 201;
  data: {
    roomId: number;
    roomType: ChatRoomType;
    quoteId: number | null;
    createdAt?: string;
    updatedAt: string;
  };
}

export interface ChatRoomPartner {
  id: string;
  userType: UserType;
  /** User.name */
  name: string;
  /** User.nickname */
  nickname: string;
  /** roomType별 표시명. COMMUNITY=닉네임, 견적=이름 (#299) */
  displayName: string;
  profileImageUrl: string | null;
}

export interface ChatRoomLastMessage {
  messageId: number;
  senderId: string;
  content: string;
  messageType: MessageType;
  createdAt: string;
}

export interface ChatRoomListItem {
  roomId: number;
  roomType: ChatRoomType;
  /** 연결된 견적 상태. 견적 없거나 커뮤니티 방이면 null */
  quoteStatus: QuoteStatus | null;
  partner: ChatRoomPartner;
  lastMessage: ChatRoomLastMessage | null;
  /** 사용자 관점 마지막 활동 시각(방 생성·재참여·메시지 중 최신, ISO) */
  lastActivityAt: string;
  partnerLastReadMessageId: number | null;
  partnerLastReadAt: string | null;
  unreadCount: number;
}

export interface ChatRoomListResult {
  rooms: ChatRoomListItem[];
}

export interface UnreadCountResult {
  unreadCount: number;
}

export interface ChatRoomDetailResult {
  roomType: ChatRoomType;
  partner: ChatRoomPartner;
  requestSummary: {
    estimateRequestId: number;
    moveType: MoveType | null;
    moveDate: string | null;
    originAddress: string | null;
    destinationAddress: string | null;
  } | null;
  quoteId: number | null;
  /** 연결된 견적 상태. 견적 없거나 커뮤니티 방이면 null */
  quoteStatus: QuoteStatus | null;
  isMessagingAllowed: boolean;
  /** 상대방이 마지막으로 읽은 메시지 ID. 읽음 기록 없으면 null */
  partnerLastReadMessageId: number | null;
  /** 상대방 readAt(ISO). 읽음 기록 없으면 null */
  partnerLastReadAt: string | null;
  /** 상대가 방을 나간 상태인지 (#314) */
  isPartnerLeft: boolean;
  /** 상대가 나간 시각(ISO). 활성 참여 중이면 null (#314) */
  partnerLeftAt: string | null;
  updatedAt: string;
}

export interface ChatMessageItem {
  messageId: number;
  senderId: string;
  senderUserType: UserType;
  messageType: MessageType;
  content: string;
  isFiltered: boolean;
  attachments: string[];
  createdAt: string;
}

export interface ChatMessagesData {
  messages: ChatMessageItem[];
}

export interface ChatMessagesMeta {
  hasNext: boolean;
  nextCursor: number | null;
}

export interface ChatMessagesResult {
  data: ChatMessagesData;
  meta: ChatMessagesMeta;
}

export interface MarkChatRoomAsReadResult {
  lastReadMessageId: number;
  readAt: string;
}

export interface LeaveChatRoomResult {
  roomId: number;
  leftAt: string;
}
