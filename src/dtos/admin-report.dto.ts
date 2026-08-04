import type { UserType } from '@prisma/client';
import type { PaginationDto } from './admin-member.dto';
import type { AdminReportListRow } from '../repositories/admin-report.repository';

/** 신고자 요약 — 관리자 회원 목록의 기본 유저 필드와 맞춘다 */
export interface AdminReportReporterDto {
  id: string;
  name: string;
  nickname: string;
  email: string;
  userType: UserType;
}

/** 관리자 신고 목록 아이템 — reporterId와 reporter를 함께 유지한다 */
export type AdminReportListItemDto = AdminReportListRow;

/** 관리자 신고 목록 조회 응답 DTO — 회원 목록과 동일한 items/pagination 구조 */
export interface AdminReportListResultDto {
  items: AdminReportListItemDto[];
  pagination: PaginationDto;
}
