import type {
  ChatRoomType,
  MessageType,
  PostsCategory,
  UserReportCategory,
  UserReportStatus,
  UserReportTarget,
  UserType,
} from '@prisma/client';
import type { PaginationDto } from './admin-member.dto';

/** 신고자 요약 — 관리자 회원 목록의 기본 유저 필드와 맞춘다 */
export interface AdminReportReporterDto {
  id: string;
  name: string;
  nickname: string;
  email: string;
  userType: UserType;
}

/** 대상 작성자/발신자 최소 요약 */
export interface AdminReportTargetAuthorDto {
  id: string;
  name: string;
  nickname: string;
}

export interface AdminReportUserTargetInfoDto {
  type: 'USER';
  id: string;
  name: string;
  nickname: string;
  email: string;
  userType: UserType;
}

export interface AdminReportReviewTargetInfoDto {
  type: 'REVIEW';
  id: number;
  rating: number;
  content: string;
  author: AdminReportTargetAuthorDto | null;
}

export interface AdminReportChatRoomTargetInfoDto {
  type: 'CHAT_ROOM';
  id: number;
  roomType: ChatRoomType;
  createdAt: Date;
}

export interface AdminReportMessageTargetInfoDto {
  type: 'MESSAGE';
  id: number;
  content: string;
  messageType: MessageType;
  sender: AdminReportTargetAuthorDto | null;
}

export interface AdminReportArticleTargetInfoDto {
  type: 'ARTICLE';
  id: number;
  title: string;
  category: PostsCategory;
  author: AdminReportTargetAuthorDto | null;
}

export interface AdminReportCommentTargetInfoDto {
  type: 'COMMENT';
  id: number;
  content: string;
  author: AdminReportTargetAuthorDto | null;
}

/**
 * 신고 대상 요약 (존재할 때만).
 * 삭제·미존재는 목록 item의 targetInfo를 null로 둔다.
 */
export type AdminReportTargetInfoDto =
  | AdminReportUserTargetInfoDto
  | AdminReportReviewTargetInfoDto
  | AdminReportChatRoomTargetInfoDto
  | AdminReportMessageTargetInfoDto
  | AdminReportArticleTargetInfoDto
  | AdminReportCommentTargetInfoDto;

/** 관리자 신고 목록 아이템 — Prisma payload와 분리한 API 응답 형태 */
export interface AdminReportListItemDto {
  id: number;
  reporterId: string;
  reporter: AdminReportReporterDto;
  target: UserReportTarget;
  targetId: string;
  targetInfo: AdminReportTargetInfoDto | null;
  category: UserReportCategory;
  status: UserReportStatus;
  createdAt: Date;
}

/** 관리자 신고 목록 조회 응답 DTO — 회원 목록과 동일한 items/pagination 구조 */
export interface AdminReportListResultDto {
  items: AdminReportListItemDto[];
  pagination: PaginationDto;
}
