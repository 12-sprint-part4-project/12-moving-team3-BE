import type { MoveType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import * as estimateRequestRepository from '../repositories/estimate-request.repository';
import type {
  EstimateRequestCursor,
  EstimateRequestFilterParams,
  EstimateRequestListRow,
} from '../repositories/estimate-request.repository';
import type { EstimateRequestSort } from '../schemas/estimate-request.schema';
import { AppError } from '../utils/app.error';
import { inferRegionLabelFromAddress } from '../utils/region.util';

export interface GetReceivedEstimateRequestsInput {
  moverId: string;
  keyword?: string;
  moveType?: MoveType[];
  designated?: boolean;
  serviceArea?: boolean;
  sort: EstimateRequestSort;
  cursor?: string;
  limit: number;
}

export interface EstimateRequestListItem {
  id: number;
  customer: { id: string; name: string };
  moveType: MoveType | null;
  moveDate: Date | null;
  departure: { address: string | null; regionLabel: string | null };
  arrival: { address: string | null; regionLabel: string | null };
  isDesignated: boolean;
  createdAt: Date;
}

export interface EstimateRequestFilterCounts {
  moveType: Record<MoveType, number>;
  serviceAreaOnly: number;
  designated: number;
}

export interface GetReceivedEstimateRequestsResult {
  items: EstimateRequestListItem[];
  meta: {
    totalCount: number;
    nextCursor: string | null;
    hasNextPage: boolean;
    filterCounts: EstimateRequestFilterCounts;
  };
}

/**
 * unknown 값이 커서 페이로드({ id, value }) 형태인지 좁힘
 * value 는 buildCursorCondition 에서 Date 로 쓰이므로 파싱 가능한 날짜 문자열만 허용
 */
const isEstimateRequestCursor = (
  value: unknown
): value is EstimateRequestCursor => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  if (!('id' in value) || !('value' in value)) {
    return false;
  }

  return (
    Number.isSafeInteger(value.id) &&
    typeof value.value === 'string' &&
    !Number.isNaN(Date.parse(value.value))
  );
};

/**
 * {id, 정렬기준값} 커서 객체를 클라이언트에 노출할 base64url 문자열로 인코딩
 */
const encodeCursor = (cursor: EstimateRequestCursor): string =>
  Buffer.from(JSON.stringify(cursor), 'utf-8').toString('base64url');

/**
 * 클라이언트가 보낸 커서 문자열을 디코딩해 {id, value} 형태로 복원
 * 형식이 올바르지 않으면 잘못된 쿼리 파라미터 에러로 처리
 */
const decodeCursor = (cursor: string): EstimateRequestCursor => {
  let decoded: unknown;

  try {
    decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8'));
  } catch {
    throw new AppError('INVALID_QUERY_PARAM');
  }

  if (!isEstimateRequestCursor(decoded)) {
    throw new AppError('INVALID_QUERY_PARAM');
  }

  return decoded;
};

/**
 * Repository 에서 조회한 원본 행(row)을 응답용 아이템 형태로 변환
 */
const toEstimateRequestListItem = (
  row: EstimateRequestListRow
): EstimateRequestListItem => ({
  id: row.id,
  customer: { id: row.user.id, name: row.user.name },
  moveType: row.moveType,
  moveDate: row.moveDate,
  departure: {
    address: row.departureAddress,
    regionLabel: inferRegionLabelFromAddress(row.departureAddress),
  },
  arrival: {
    address: row.arrivalAddress,
    regionLabel: inferRegionLabelFromAddress(row.arrivalAddress),
  },
  isDesignated: row.designatedMovers.length > 0,
  createdAt: row.createdAt,
});

/**
 * 기사님이 받은 견적 요청 목록을 조회하는 메인 유스케이스.
 * 1) 기사 프로필/서비스 지역을 조회해 미등록 여부 검증
 * 2) 목록/전체 개수/필터별 카운트를 동일 트랜잭션에서 조회
 * 3) 다음 페이지 존재 여부에 따라 nextCursor 생성
 */
export const getReceivedEstimateRequests = async (
  input: GetReceivedEstimateRequestsInput
): Promise<GetReceivedEstimateRequestsResult> => {
  const moverProfile =
    await estimateRequestRepository.findMoverProfileWithRegions(input.moverId);

  if (!moverProfile) {
    throw new AppError('PROFILE_NOT_REGISTERED');
  }

  const filterParams: EstimateRequestFilterParams = {
    moverId: input.moverId,
    keyword: input.keyword,
    moveTypes: input.moveType,
    designated: input.designated,
    serviceArea: input.serviceArea,
    serviceRegions: moverProfile.serviceRegions,
  };

  const cursor = input.cursor ? decodeCursor(input.cursor) : undefined;

  const [
    { items: rows, hasNextPage },
    totalCount,
    moveTypeCounts,
    designatedCount,
    serviceAreaCount,
  ] = await prisma.$transaction((tx) =>
    Promise.all([
      estimateRequestRepository.findEstimateRequests(
        {
          ...filterParams,
          sort: input.sort,
          cursor,
          limit: input.limit,
        },
        tx
      ),
      estimateRequestRepository.countEstimateRequests(filterParams, tx),
      estimateRequestRepository.countEstimateRequestsByMoveType(
        filterParams,
        tx
      ),
      estimateRequestRepository.countDesignatedEstimateRequests(
        filterParams,
        tx
      ),
      estimateRequestRepository.countServiceAreaEstimateRequests(
        filterParams,
        tx
      ),
    ])
  );
  const lastRow = rows.length > 0 ? rows[rows.length - 1] : undefined;
  const lastSortValue =
    input.sort === 'MOVE_DATE_ASC' ? lastRow?.moveDate : lastRow?.createdAt;

  const nextCursor =
    hasNextPage && lastRow && lastSortValue
      ? encodeCursor({ id: lastRow.id, value: lastSortValue.toISOString() })
      : null;

  return {
    items: rows.map(toEstimateRequestListItem),
    meta: {
      totalCount,
      nextCursor,
      hasNextPage,
      filterCounts: {
        moveType: moveTypeCounts,
        serviceAreaOnly: serviceAreaCount,
        designated: designatedCount,
      },
    },
  };
};
