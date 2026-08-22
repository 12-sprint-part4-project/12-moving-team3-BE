import { EstimateRequestStatus, MoveType, QuoteStatus } from '@prisma/client';
import { PaginationDto } from './admin-member.dto';

/**
 * 관리자 견적/완료 조회 — 상태 불변식을 어긴 필드는 null로 내려보낸다.
 * missingFields에 누락된 응답 필드명을 담아 프론트가 원인을 표시할 수 있게 한다.
 */
interface AdminEstimateRequestBaseResponse {
  id: number;
  userName: string;
  moveType: MoveType | null;
  departureAddress: string | null;
  arrivalAddress: string | null;
  missingFields: string[];
}

export interface AdminEstimateRequestListItemResponse extends AdminEstimateRequestBaseResponse {
  phoneNumber: string | null;
  submittedAt: Date | null;
  status: EstimateRequestStatus;
  estimateCount: number;
  mover: string | null;
}

export interface AdminEstimateRequestListDto {
  data: AdminEstimateRequestListItemResponse[];
  meta: PaginationDto;
}

export interface AdminCompletedListItemResponse extends AdminEstimateRequestBaseResponse {
  phoneNumber: string | null;
  moveDate: Date | null;
  mover: string | null;
  price: number | null;
}

export interface AdminCompletedListDto {
  data: AdminCompletedListItemResponse[];
  meta: PaginationDto;
}

export interface AdminEstimateRequestDetailResponse extends AdminEstimateRequestBaseResponse {
  userNickname: string;
  submittedAt: Date | null;
  status: EstimateRequestStatus;
  departureZipCode: string | null;
  departureDetailAddress: string | null;
  arrivalZipCode: string | null;
  arrivalDetailAddress: string | null;
  activeQuotesCount: number;
  deletedQuotesCount: number;
  activeQuotes: AdminEstimateQuoteResponse[];
  deletedQuotes: AdminEstimateQuoteResponse[];
  /** 목록 필터·정렬 기준 이전 건. 없으면 null */
  prevId: number | null;
  /** 목록 필터·정렬 기준 다음 건. 없으면 null */
  nextId: number | null;
}

// 반려 된 견적은 가격이 없을 수 있음. mover가 없으면 moverName·moverNickname은 null
export interface AdminEstimateQuoteResponse {
  id: number;
  moverName: string | null;
  moverNickname: string | null;
  price: number | null;
  status: QuoteStatus;
  createdAt: Date;
}

export interface AdminEstimateRequestDetailDto {
  data: AdminEstimateRequestDetailResponse;
}

export interface AdminConfirmedQuoteResponse {
  moverName: string | null;
  moverNickname: string | null;
  price: number | null;
  comment: string | null;
  createdAt: Date | null;
}

export interface AdminCompletedRequestDetailResponse extends AdminEstimateRequestBaseResponse {
  userNickname: string;
  departureZipCode: string | null;
  departureDetailAddress: string | null;
  arrivalZipCode: string | null;
  arrivalDetailAddress: string | null;
  moveDate: Date | null;
  confirmedQuote: AdminConfirmedQuoteResponse | null;
  /** 목록 필터·정렬 기준 이전 건. 없으면 null */
  prevId: number | null;
  /** 목록 필터·정렬 기준 다음 건. 없으면 null */
  nextId: number | null;
}

export interface AdminCompletedRequestDetailDto {
  data: AdminCompletedRequestDetailResponse;
}
