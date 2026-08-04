import type { PaginationDto } from './admin-member.dto';
import type { AdminReportListRow } from '../repositories/admin-report.repository';

/** 관리자 신고 목록 조회 응답 DTO — 회원 목록과 동일한 items/pagination 구조 */
export interface AdminReportListResultDto {
  items: AdminReportListRow[];
  pagination: PaginationDto;
}
