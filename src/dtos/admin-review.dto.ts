import type { PaginationDto } from './admin-member.dto';

/**
 * 관리자 리뷰 목록 아이템 DTO.
 * 작성자·기사 정보 확장은 이후 TODO — Review 모델 필드만 노출한다.
 */
export interface AdminReviewListItemDto {
  id: number;
  userId: string;
  quoteId: number;
  rating: number;
  content: string;
  createdAt: Date;
  updatedAt: Date | null;
}

/** 관리자 리뷰 목록 조회 응답 DTO — 회원/채팅 목록과 동일한 items/pagination 구조 */
export interface AdminReviewListResultDto {
  items: AdminReviewListItemDto[];
  pagination: PaginationDto;
}
