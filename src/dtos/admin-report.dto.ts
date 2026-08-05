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

/** 신고를 처리한 관리자 요약 — PENDING이면 null이 될 수 있다 */
export interface AdminReportAdminDto {
  id: number;
  name: string;
  email: string;
}

/**
 * 신고자 상세.
 * 목록 요약(AdminReportReporterDto)에 탈퇴 상태를 더한다.
 * 탈퇴 계정 신고도 관리자가 맥락을 볼 수 있어야 해서 deletedAt을 노출한다.
 */
export interface AdminReportDetailReporterDto extends AdminReportReporterDto {
  /** deletedAt 유무로 탈퇴 여부를 프론트가 바로 분기할 수 있게 한다 */
  isDeleted: boolean;
  deletedAt: Date | null;
}

/**
 * 대상·콘텐츠에 연결된 사용자 요약.
 * 작성자/발신자가 없거나 조회 실패여도 상위 DTO가 깨지지 않도록 nullable로 둔다.
 */
export interface AdminReportDetailUserSummaryDto {
  id: string;
  name: string;
  nickname: string;
  email: string;
  userType: UserType;
  isDeleted: boolean;
  deletedAt: Date | null;
}

/**
 * 신고 대상 상태.
 * 목록은 미존재·삭제 시 targetInfo를 null로 두지만,
 * 상세는 exists/isDeleted로 구분해 프론트가 "없음"과 "삭제됨"을 다르게 표시할 수 있게 한다.
 */
export interface AdminReportDetailTargetDto {
  type: UserReportTarget;
  id: string;
  /** DB에 해당 대상 레코드가 있는지 */
  exists: boolean;
  /**
   * soft-delete 여부.
   * 레코드가 아예 없으면 false — exists와 함께 써야 상태를 오해하지 않는다.
   */
  isDeleted: boolean;
  /**
   * USER 대상이거나 콘텐츠 작성자/발신자가 있을 때 채운다.
   * 대상 미존재·작성자 없음이면 null을 유지해 구조를 고정한다.
   */
  user: AdminReportDetailUserSummaryDto | null;
}

/**
 * 신고된 콘텐츠 본문.
 * USER 대상처럼 별도 콘텐츠가 없으면 상위 content를 null로 두고,
 * 필드 단위로는 title/body를 nullable로 둬 유형별 차이를 흡수한다.
 */
export interface AdminReportDetailContentDto {
  type: UserReportTarget;
  id: string;
  /** 게시글 제목 등. 메시지·댓글처럼 제목이 없으면 null */
  title: string | null;
  /** 본문·리뷰·메시지 내용. 없으면 null */
  body: string | null;
  createdAt: Date | null;
  deletedAt: Date | null;
  /**
   * rating, messageType, roomType, category처럼 유형 전용 필드를 담는 확장 슬롯.
   * 공통 필드를 늘리지 않고도 상세 화면이 필요한 메타를 받을 수 있다.
   */
  metadata: Record<string, unknown> | null;
}

/**
 * 관리자 신고 상세 조회 응답 DTO.
 * Prisma UserReport payload를 그대로 노출하지 않고 API 계약을 고정한다.
 */
export interface AdminReportDetailDto {
  id: number;
  target: UserReportTarget;
  targetId: string;
  category: UserReportCategory;
  status: UserReportStatus;
  /** 미처리(PENDING)면 null */
  adminId: number | null;
  admin: AdminReportAdminDto | null;
  createdAt: Date;
  reporter: AdminReportDetailReporterDto;
  /** 항상 객체를 내려 exists/isDeleted로 상태를 표현한다 (null로 구조를 깨지 않음) */
  targetInfo: AdminReportDetailTargetDto;
  /** USER 신고이거나 콘텐츠를 조회할 수 없으면 null */
  content: AdminReportDetailContentDto | null;
}
