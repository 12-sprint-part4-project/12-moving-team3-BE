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
