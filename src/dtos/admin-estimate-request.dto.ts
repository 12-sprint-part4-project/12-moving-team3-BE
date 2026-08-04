import { EstimateRequestStatus, MoveType, QuoteStatus } from '@prisma/client';
import { PaginationDto } from './admin-member.dto';

interface AdminEstimateRequestBaseResponse {
  id: number;
  userName: string;
  moveType: MoveType;
  departureAddress: string;
  arrivalAddress: string;
}

export interface AdminEstimateRequestListItemResponse extends AdminEstimateRequestBaseResponse {
  phoneNumber: string | null;
  submittedAt: Date;
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
  moveDate: Date;
  mover: string;
  price: number;
}

export interface AdminCompletedListDto {
  data: AdminCompletedListItemResponse[];
  meta: PaginationDto;
}

export interface AdminEstimateRequestDetailResponse extends AdminEstimateRequestBaseResponse {
  submittedAt: Date;
  status: EstimateRequestStatus;
  estimateCount: number;
  departureZipCode: string;
  departureDetailAddress: string;
  arrivalZipCode: string;
  arrivalDetailAddress: string;
  quotes: AdminEstimateQuoteResponse[];
}

// 반려 된 견적은 가격이 없을 수 있음
export interface AdminEstimateQuoteResponse {
  id: number;
  moverName: string;
  price: number | null;
  status: QuoteStatus;
  createdAt: Date;
}

export interface AdminEstimateRequestDetailDto {
  data: AdminEstimateRequestDetailResponse;
}
