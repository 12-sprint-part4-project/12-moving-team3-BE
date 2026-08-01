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
   * UserStatusInfo 관계가 없을 수 있다.
   * ACTIVE 기본값 정책은 Service 단계에서 확정하고, DTO는 null을 허용한다.
   */
  status: UserStatus | null;
  suspendedAt: Date | null;
  suspendedUntil: Date | null;
  createdAt: Date;
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
