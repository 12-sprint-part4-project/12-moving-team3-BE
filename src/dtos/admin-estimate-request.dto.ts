import { EstimateRequestStatus, MoveType } from '@prisma/client';
import { PaginationDto } from './admin-member.dto';

export interface AdminEstimateRequestListItemResponse {
  id: number;
  userName: string;
  phoneNumber: string | null;
  moveType: MoveType;
  departureAddress: string;
  arrivalAddress: string;
  submittedAt: Date;
  status: EstimateRequestStatus;
  estimateCount: number;
  mover: string | null;
}

export interface AdminEstimateRequestListDto {
  data: AdminEstimateRequestListItemResponse[];
  meta: PaginationDto;
}
