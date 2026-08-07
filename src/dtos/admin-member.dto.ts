import type { UserStatus, UserType } from '@prisma/client';

/** 관리자 회원 목록 아이템 DTO */
export interface AdminMemberListItemDto {
  id: string;
  name: string;
  nickname: string;
  email: string;
  /** Prisma User.phoneNumber는 optional이므로 null 허용 */
  phoneNumber: string | null;
  userType: UserType;
  /**
   * UserStatusInfo가 없으면 Service에서 ACTIVE로 정규화한다.
   * (스키마 기본값 ACTIVE + 관계 부재는 미생성으로 간주)
   */
  status: UserStatus;
  suspendedAt: Date | null;
  suspendedUntil: Date | null;
  createdAt: Date;
  /** MOVER 평균 평점. CUSTOMER이거나 리뷰가 없으면 null */
  averageRating: number | null;
}

/** page 기반 목록 공통 페이지네이션 DTO */
export interface PaginationDto {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

/** 관리자 회원 목록 조회 응답 DTO */
export interface AdminMemberListResultDto {
  items: AdminMemberListItemDto[];
  pagination: PaginationDto;
}

/** 관리자 회원 계정 상태 변경(정지/활성화) 응답 DTO */
export interface AdminMemberStatusResultDto {
  memberId: string;
  status: UserStatus;
  suspendedAt: Date | null;
  suspendedUntil: Date | null;
}
