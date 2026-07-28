import type { MoveType } from '@prisma/client';

/** 견적 상세 조회 응답 DTO */
export interface QuoteDetailDto {
  id: number;
  estimateRequestId: number;
  price: number | null;
  isMoveCompleted: boolean;
  customer: { name: string };
  moveType: MoveType | null;
  isDesignated: boolean;
  requestedAt: Date | null;
  moveDate: Date | null;
  fromAddress: string | null;
  toAddress: string | null;
}

/** 반려한 견적 목록 아이템 DTO */
export interface RejectedQuoteListItemDto {
  id: number;
  estimateRequestId: number;
  customer: { name: string };
  moveType: MoveType | null;
  isDesignated: boolean;
  moveDate: Date | null;
  fromRegionLabel: string | null;
  toRegionLabel: string | null;
  createdAt: Date;
}

/** 보낸 견적 목록 아이템 DTO */
export interface SentQuoteListItemDto {
  id: number;
  estimateRequestId: number;
  customer: { name: string };
  moveType: MoveType | null;
  isConfirmed: boolean;
  isDesignated: boolean;
  moveDate: Date | null;
  fromRegionLabel: string | null;
  toRegionLabel: string | null;
  price: number | null;
  isMoveCompleted: boolean;
  createdAt: Date;
}

/** 견적 목록 조회 응답 DTO */
export interface QuoteListResultDto {
  items: RejectedQuoteListItemDto[] | SentQuoteListItemDto[];
  meta: {
    totalCount: number;
    totalPages: number;
    currentPage: number;
    limit: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}
