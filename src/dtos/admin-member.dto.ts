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

/** 관리자 회원 목록 페이지네이션 DTO */
export interface AdminMemberListPaginationDto {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

/** 관리자 회원 목록 조회 응답 DTO */
export interface AdminMemberListResultDto {
  items: AdminMemberListItemDto[];
  pagination: AdminMemberListPaginationDto;
}
