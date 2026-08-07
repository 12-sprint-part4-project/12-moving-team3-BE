import type {
  ChatRoomType,
  MessageType,
  MoveType,
  PostsCategory,
  Region,
  UserReportCategory,
  UserReportStatus,
  UserReportTarget,
  UserStatus,
  UserType,
} from '@prisma/client';
import type { AdminReportProcessAction } from '../schemas/admin-report.schema';
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
 * 일반 회원(CUSTOMER) 프로필 요약.
 * 부적절한 프로필 신고 상세에서 희망 지역·이용 서비스를 보여주기 위해 둔다.
 * 전화번호는 신고 상세에 포함하지 않는다.
 */
export interface AdminReportDetailCustomerProfileDto {
  region: Region | null;
  service: MoveType[];
}

/**
 * 기사(MOVER) 서비스 가능 지역.
 * 회원 상세의 serviceRegions 항목과 동일하게 region만 노출한다.
 */
export interface AdminReportDetailMoverServiceRegionDto {
  region: Region;
}

/**
 * 기사(MOVER) 프로필 요약.
 * 소개글·경력·서비스 지역처럼 프로필 신고 검토에 필요한 필드만 담는다.
 */
export interface AdminReportDetailMoverProfileDto {
  service: MoveType[];
  career: number | null;
  shortDescription: string | null;
  description: string | null;
  serviceRegions: AdminReportDetailMoverServiceRegionDto[];
}

/**
 * 신고 대상 사용자의 역할별 프로필 묶음.
 * CUSTOMER/MOVER 중 해당 타입만 채우고 나머지는 null로 둔다.
 * 프로필 row 자체가 없으면 상위 profile을 null로 둔다.
 */
export interface AdminReportDetailUserProfileDto {
  customer: AdminReportDetailCustomerProfileDto | null;
  mover: AdminReportDetailMoverProfileDto | null;
}

/**
 * 대상·콘텐츠에 연결된 사용자 요약.
 * 작성자/발신자가 없거나 조회 실패여도 상위 DTO가 깨지지 않도록 nullable로 둔다.
 * 기존 필드는 유지하고, 프로필 검토용 필드는 확장으로만 추가한다.
 *
 * profileImageKey·profile은 이번 커밋에서 타입만 추가한다.
 * Service 매핑 전에는 응답에 없을 수 있어 optional로 두고,
 * 다음 커밋에서 항상 string|null / object|null로 채운다.
 */
export interface AdminReportDetailUserSummaryDto {
  id: string;
  name: string;
  nickname: string;
  email: string;
  userType: UserType;
  isDeleted: boolean;
  deletedAt: Date | null;
  /** User.profileImageKey. 없으면 null */
  profileImageKey?: string | null;
  /**
   * 일반/기사 프로필.
   * 프로필이 아직 없거나 USER 대상이 아니면 null.
   */
  profile?: AdminReportDetailUserProfileDto | null;
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
 * 신고 처리용 대상 사용자 요약.
 * UserStatusInfo가 없으면 Service에서 ACTIVE·null로 정규화한다.
 */
export interface AdminReportDetailTargetUserDto {
  id: string;
  name: string;
  nickname: string;
  status: UserStatus;
  suspendedAt: Date | null;
  suspendedUntil: Date | null;
}

/** 신고 상세에서 선택 가능한 Action 플래그 */
export interface AdminReportAvailableActionsDto {
  canSuspendUser: boolean;
  canDeleteContent: boolean;
}

export interface AdminReportDetailReportedReviewContentDto {
  type: 'REVIEW';
  id: string;
  rating: number;
  content: string;
  createdAt: Date;
  updatedAt: Date | null;
  deletedAt: Date | null;
}

export interface AdminReportDetailReportedArticleContentDto {
  type: 'ARTICLE';
  id: string;
  category: PostsCategory;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface AdminReportDetailReportedCommentContentDto {
  type: 'COMMENT';
  id: string;
  postId: number;
  parentId: number | null;
  content: string;
  createdAt: Date;
  deletedAt: Date | null;
}

/** 메시지는 soft-delete가 없어 deletedAt을 두지 않는다 */
export interface AdminReportDetailReportedMessageContentDto {
  type: 'MESSAGE';
  id: string;
  roomId: number;
  messageType: MessageType;
  content: string;
  isFiltered: boolean;
  createdAt: Date;
}

/**
 * 신고된 콘텐츠 상세.
 * USER는 null, CHAT_ROOM은 이번 Action 범위에서 지원하지 않아 null로 둔다.
 */
export type AdminReportDetailReportedContentDto =
  | AdminReportDetailReportedReviewContentDto
  | AdminReportDetailReportedArticleContentDto
  | AdminReportDetailReportedCommentContentDto
  | AdminReportDetailReportedMessageContentDto;

/**
 * 관리자 신고 처리(resolve) 결과.
 * Action은 UserReport에 저장하지 않으므로 응답으로만 돌려준다.
 */
export interface AdminReportResolveResultDto {
  reportId: number;
  status: UserReportStatus;
  adminId: number;
  /** 요청·적용한 Action 목록 (저장 컬럼 없음) */
  actions: AdminReportProcessAction[];
  processedAt: Date;
  /**
   * DELETE_REPORTED_CONTENT가 포함된 경우에만 채운다.
   * true면 이미 삭제된 콘텐츠를 성공으로 간주한 경우.
   */
  contentAlreadyDeleted: boolean | null;
}

/**
 * 관리자 신고 반려(reject) 결과.
 * Action이 없으므로 resolve 결과와 분리한다.
 */
export interface AdminReportRejectResultDto {
  reportId: number;
  status: UserReportStatus;
  adminId: number;
  /** 응답용 처리 시각 — ERD에 별도 저장 컬럼 없음 */
  processedAt: Date;
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
  /** 정지 Action용 대상 사용자. 없거나 CHAT_ROOM이면 null */
  targetUser: AdminReportDetailTargetUserDto | null;
  /** 콘텐츠 삭제 Action·표시용. USER/CHAT_ROOM·미존재면 null */
  reportedContent: AdminReportDetailReportedContentDto | null;
  availableActions: AdminReportAvailableActionsDto;
}
