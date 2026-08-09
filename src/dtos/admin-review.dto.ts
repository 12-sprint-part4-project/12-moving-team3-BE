import type { UserType } from '@prisma/client';
import type { PaginationDto } from './admin-member.dto';

/**
 * 관리자 리뷰 목록 — 작성자·기사 요약.
 * 신고 목록 reporter / 채팅 참여자와 동일하게 식별용 최소 필드만 둔다.
 */
export interface AdminReviewUserSummaryDto {
  id: string;
  name: string;
  nickname: string;
  email: string;
  userType: UserType;
}

/**
 * 관리자 리뷰 목록 아이템 DTO.
 * author는 Review.user(필수), mover는 Quote.mover(nullable)다.
 */
export interface AdminReviewListItemDto {
  id: number;
  userId: string;
  quoteId: number;
  rating: number;
  content: string;
  createdAt: Date;
  updatedAt: Date | null;
  /** soft delete 시각. 미삭제이면 null */
  deletedAt: Date | null;
  /** 리뷰 작성자 (Review.user) */
  author: AdminReviewUserSummaryDto;
  /** 견적 기사 (Review.quote.mover). moverId가 없으면 null */
  mover: AdminReviewUserSummaryDto | null;
}

/** 관리자 리뷰 목록 조회 응답 DTO — 회원/채팅 목록과 동일한 items/pagination 구조 */
export interface AdminReviewListResultDto {
  items: AdminReviewListItemDto[];
  pagination: PaginationDto;
}
