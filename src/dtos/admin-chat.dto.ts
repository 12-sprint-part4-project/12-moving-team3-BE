import type { ChatRoomType, MessageType, UserType } from '@prisma/client';
import type { PaginationDto } from './admin-member.dto';

/** 관리자 채팅방 목록 — 참여자 요약 */
export interface AdminChatParticipantDto {
  id: string;
  name: string;
  nickname: string;
  email: string;
  userType: UserType;
  /** ChatRoomParticipant.joinedAt */
  joinedAt: Date;
  /** ChatRoomParticipant.leftAt — 활성 참여면 null */
  leftAt: Date | null;
  /**
   * User.deletedAt 유무로 Service에서 정규화한다.
   * Prisma에 isDeleted 컬럼은 없고, 탈퇴 계정 채팅도 관리자가 확인할 수 있어야 한다.
   */
  isDeleted: boolean;
}

/**
 * 관리자 채팅방 목록 — 마지막 메시지 요약.
 * 메시지가 없는 방은 null로 둔다.
 */
export interface AdminChatLastMessageDto {
  id: number;
  senderId: string;
  content: string;
  messageType: MessageType;
  createdAt: Date;
}

/** 관리자 채팅방 목록 아이템 DTO */
export interface AdminChatListItemDto {
  id: number;
  roomType: ChatRoomType;
  /** Prisma ChatRoom.estimateRequestId — 견적 미연결 방이면 null */
  estimateRequestId: number | null;
  /** Prisma ChatRoom.quoteId — 견적 미연결 방이면 null */
  quoteId: number | null;
  /** Prisma ChatRoom.communityPostId — 커뮤니티 방이 아니면 null */
  communityPostId: number | null;
  /** Prisma ChatRoom.lastMessageAt — 메시지가 한 번도 없으면 null */
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  participants: AdminChatParticipantDto[];
  lastMessage: AdminChatLastMessageDto | null;
}

/** 관리자 채팅방 목록 조회 응답 DTO — 회원/신고 목록과 동일한 items/pagination 구조 */
export interface AdminChatListResultDto {
  items: AdminChatListItemDto[];
  pagination: PaginationDto;
}

/** 관리자 채팅방 상세 조회 응답 DTO */
export interface AdminChatDetailDto {
  id: number;
  roomType: ChatRoomType;
  /** Prisma ChatRoom.estimateRequestId */
  estimateRequestId: number | null;
  /** Prisma ChatRoom.quoteId */
  quoteId: number | null;
  /** Prisma ChatRoom.designatedMoverId */
  designatedMoverId: number | null;
  /** Prisma ChatRoom.communityPostId */
  communityPostId: number | null;
  /** Prisma ChatRoom.lastMessageAt — 메시지가 한 번도 없으면 null */
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /** 목록과 동일 참여자 DTO. 재참여 중복 정규화는 Service에서 처리한다. */
  participants: AdminChatParticipantDto[];
}

/**
 * 관리자 메시지 발신자 요약.
 * 참여자(AdminChatParticipantDto)와 달리 joinedAt/leftAt이 없어 별도 타입으로 둔다.
 */
export interface AdminChatMessageSenderDto {
  id: string;
  name: string;
  nickname: string;
  email: string;
  userType: UserType;
  /** User.deletedAt 유무로 Service에서 정규화한다. */
  isDeleted: boolean;
}

/**
 * 관리자 채팅 메시지 DTO.
 * attachments는 사용자 채팅과 같이 Presigned URL 문자열 배열이다.
 * rawContent는 ChatMessageRawLog 원문이며 관리자 전용 조회 필드다.
 */
export interface AdminChatMessageDto {
  id: number;
  senderId: string;
  sender: AdminChatMessageSenderDto;
  messageType: MessageType;
  /** ChatMessage.content — 필터링 시 마스킹된 값일 수 있다 */
  content: string;
  /**
   * 필터링 전 원문(ChatMessageRawLog.rawContent).
   * RawLog가 없으면 null. 관리자 전용이며 content를 대체하지 않는다.
   */
  rawContent: string | null;
  isFiltered: boolean;
  /** IMAGE면 Presigned URL 목록, TEXT면 빈 배열 */
  attachments: string[];
  createdAt: Date;
}

/** 사용자 채팅 메시지 API와 동일한 커서 페이지네이션 meta */
export interface AdminChatMessagesMetaDto {
  hasNext: boolean;
  nextCursor: number | null;
}

/**
 * 관리자 메시지 히스토리 응답 DTO.
 * Controller의 `{ data }` wrapper는 포함하지 않는다.
 */
export interface AdminChatMessagesResultDto {
  messages: AdminChatMessageDto[];
  meta: AdminChatMessagesMetaDto;
}
