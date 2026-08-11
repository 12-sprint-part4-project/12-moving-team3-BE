import type {
  EstimateRequestStatus,
  MoveType,
  QuoteStatus,
} from '@prisma/client';

// --- [기사님(MOVER)용 API] ---

/** 견적 상세 조회 응답 DTO */
export interface QuoteDetailDto {
  id: number;
  estimateRequestId: number;
  price: number | null;
  status: QuoteStatus;
  comment: string | null;
  rejectReason: string | null;
  estimateRequestStatus: EstimateRequestStatus;
  isMoveCompleted: boolean;
  customer: { name: string };
  moveType: MoveType | null;
  isDesignated: boolean;
  /** EstimateDesignatedMover.id — 지정 채팅방 생성용. 비지정이면 null */
  designatedMoverId: number | null;
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
  /** EstimateDesignatedMover.id — 지정 채팅방 생성용. 비지정이면 null */
  designatedMoverId: number | null;
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
  /** EstimateDesignatedMover.id — 지정 채팅방 생성용. 비지정이면 null */
  designatedMoverId: number | null;
  moveDate: Date | null;
  fromRegionLabel: string | null;
  toRegionLabel: string | null;
  price: number | null;
  estimateRequestStatus: EstimateRequestStatus;
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

// --- [일반 유저(CUSTOMER)용 API] ---

/** 고객 응답용 기사님 카드 정보 */
export interface CustomerQuoteMoverDto {
  moverId: string;
  name: string;
  profileImage: string | null;
  shortDescription: string | null;
  rating: number;
  reviewCount: number;
  career: number | null;
  confirmedQuoteCount: number;
  favoriteCount: number;
  isFavorited: boolean;
}

/** 고객 견적 목록 아이템 */
export interface CustomerQuoteItemDto {
  quoteId: number;
  price: number | null;
  status: QuoteStatus;
  isDesignated: boolean;
  /** EstimateDesignatedMover.id — 지정 채팅방 생성용. 비지정이면 null */
  designatedMoverId: number | null;
  mover: CustomerQuoteMoverDto;
}

/** 대기 중인 견적 리스트 응답 */
export interface CustomerPendingQuotesDto {
  estimateRequestId: number;
  status: EstimateRequestStatus;
  submittedAt: Date | null;
  serviceType: MoveType | null;
  moveDate: Date | null;
  fromAddress: string | null;
  toAddress: string | null;
  quoteCount: {
    general: number;
    designated: number;
  };
  quotes: CustomerQuoteItemDto[];
}

/** 받았던 견적(과거) 리스트 아이템 */
export interface CustomerPastQuoteGroupDto {
  estimateRequestId: number;
  status: EstimateRequestStatus;
  submittedAt: Date | null;
  /** 견적 확정 시각 */
  confirmedAt: Date | null;
  serviceType: MoveType | null;
  moveDate: Date | null;
  fromAddress: string | null;
  toAddress: string | null;
  quotes: CustomerQuoteItemDto[];
}

/** 받았던 견적 리스트 응답 */
export interface CustomerPastQuotesResultDto {
  items: CustomerPastQuoteGroupDto[];
  meta: {
    nextCursor: number | null;
    hasNextPage: boolean;
  };
}

/** 고객 견적 상세 응답 */
export interface CustomerQuoteDetailDto {
  quoteId: number;
  estimateRequestId: number;
  price: number | null;
  comment: string | null;
  status: QuoteStatus;
  isDesignated: boolean;
  /** EstimateDesignatedMover.id — 지정 채팅방 생성용. 비지정이면 null */
  designatedMoverId: number | null;
  estimateRequestStatus: EstimateRequestStatus;
  serviceType: MoveType | null;
  moveDate: Date | null;
  submittedAt: Date | null;
  fromAddress: string | null;
  toAddress: string | null;
  mover: CustomerQuoteMoverDto;
}

/** 견적 확정 응답 */
export interface ConfirmQuoteDto {
  confirmedQuoteId: number;
}
