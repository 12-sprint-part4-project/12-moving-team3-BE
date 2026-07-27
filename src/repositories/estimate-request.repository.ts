import {
  EstimateRequestStatus,
  MoveType,
  type Prisma,
  type Region,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import type { EstimateRequestSort } from '../schemas/estimate-request.schema';
import { getRegionAddressKeywords } from '../utils/region.util';

type DbClient = Prisma.TransactionClient;
export interface MoverProfileWithRegions {
  serviceRegions: Region[];
}

/**
 * 기사님 ID로 MoverProfile 과 등록된 서비스 가능 지역 목록 조회
 */
export const findMoverProfileWithRegions = async (
  userId: string
): Promise<MoverProfileWithRegions | null> => {
  const profile = await prisma.moverProfile.findUnique({
    where: { userId },
    select: {
      serviceRegions: { select: { region: true } },
    },
  });

  if (!profile) return null;

  return {
    serviceRegions: profile.serviceRegions.map(
      (serviceRegion) => serviceRegion.region
    ),
  };
};

export interface EstimateRequestFilterParams {
  moverId: string;
  keyword?: string;
  moveTypes?: MoveType[];
  designated?: boolean;
  serviceArea?: boolean;
  serviceRegions: Region[];
}

export interface EstimateRequestCursor {
  id: number;
  value: string;
}

export interface FindEstimateRequestsParams extends EstimateRequestFilterParams {
  sort: EstimateRequestSort;
  cursor?: EstimateRequestCursor;
  limit: number;
}

export interface EstimateRequestListRow {
  id: number;
  moveType: MoveType | null;
  moveDate: Date | null;
  departureAddress: string | null;
  arrivalAddress: string | null;
  createdAt: Date;
  user: { id: string; name: string };
  designatedMovers: { id: number }[];
}

/**
 * moveDate(@db.Date) 비교를 위해 주어진 날짜를 UTC 자정으로 내림
 */
const startOfDay = (date: Date): Date =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );

/**
 * 기사님의 서비스 가능 지역(Region) 목록을 주소 매칭 키워드로 변환
 * 출발지 또는 도착지 주소가 해당 키워드로 시작하면 매칭되도록 하는 조건 생성
 * 등록된 지역이 없으면 결과가 없도록 빈 id 집합 조건 반환
 */
const buildServiceAreaCondition = (
  serviceRegions: Region[]
): Prisma.EstimateRequestWhereInput => {
  if (serviceRegions.length === 0) {
    return { id: { in: [] } };
  }

  const keywords = serviceRegions.flatMap((region) =>
    getRegionAddressKeywords(region)
  );

  return {
    OR: [
      ...keywords.map((keyword) => ({
        departureAddress: { startsWith: keyword },
      })),
      ...keywords.map((keyword) => ({
        arrivalAddress: { startsWith: keyword },
      })),
    ],
  };
};

/**
 * 목록/카운트 조회에 공통으로 쓰이는 where 조건 생성
 * - 기본 제외 조건: SUBMITTED 상태가 아니거나, 이사일이 지났거나,
 *   이 기사님이 이미 견적을 제출/반려(Quote 존재)한 요청은 항상 제외
 * - keyword/moveType/designated/serviceArea 는 값이 주어졌을 때만 조건에 추가되는 동적 필터
 */
const buildWhere = (
  params: EstimateRequestFilterParams,
  now: Date
): Prisma.EstimateRequestWhereInput => {
  const conditions: Prisma.EstimateRequestWhereInput[] = [
    {
      status: EstimateRequestStatus.SUBMITTED,
      moveDate: { gte: startOfDay(now) },
      quotes: { none: { moverId: params.moverId, deletedAt: null } },
    },
  ];

  if (params.keyword) {
    conditions.push({
      user: { name: { contains: params.keyword, mode: 'insensitive' } },
    });
  }

  if (params.moveTypes && params.moveTypes.length > 0) {
    conditions.push({ moveType: { in: params.moveTypes } });
  }

  if (params.designated) {
    conditions.push({
      designatedMovers: { some: { moverId: params.moverId } },
    });
  }

  if (params.serviceArea) {
    conditions.push(buildServiceAreaCondition(params.serviceRegions));
  }

  return { AND: conditions };
};

/**
 * 키셋(keyset) 방식의 커서 조건 생성
 * 정렬 기준 필드가 커서 값보다 크거나, 값이 같다면 id 가 커서보다 큰 행만 조회
 */
const buildCursorCondition = (
  sort: EstimateRequestSort,
  cursor: EstimateRequestCursor
): Prisma.EstimateRequestWhereInput => {
  const cursorDate = new Date(cursor.value);
  const sortField = sort === 'MOVE_DATE_ASC' ? 'moveDate' : 'createdAt';

  return {
    OR: [
      { [sortField]: { gt: cursorDate } },
      { [sortField]: cursorDate, id: { gt: cursor.id } },
    ],
  };
};

const listSelect = {
  id: true,
  moveType: true,
  moveDate: true,
  departureAddress: true,
  arrivalAddress: true,
  createdAt: true,
  user: { select: { id: true, name: true } },
} as const;

/**
 * 필터/정렬/커서 조건에 맞는 견적 요청 목록 조회
 * limit 보다 1개 더 조회해 다음 페이지 존재 여부(hasNextPage) 판단
 */
export const findEstimateRequests = async (
  params: FindEstimateRequestsParams,
  db: DbClient = prisma
): Promise<{ items: EstimateRequestListRow[]; hasNextPage: boolean }> => {
  const now = new Date();
  const baseWhere = buildWhere(params, now);
  const where: Prisma.EstimateRequestWhereInput = params.cursor
    ? { AND: [baseWhere, buildCursorCondition(params.sort, params.cursor)] }
    : baseWhere;

  const orderBy: Prisma.EstimateRequestOrderByWithRelationInput[] =
    params.sort === 'MOVE_DATE_ASC'
      ? [{ moveDate: 'asc' }, { id: 'asc' }]
      : [{ createdAt: 'asc' }, { id: 'asc' }];

  const rows = await db.estimateRequest.findMany({
    where,
    orderBy,
    take: params.limit + 1,
    select: {
      ...listSelect,
      designatedMovers: {
        where: { moverId: params.moverId },
        select: { id: true },
        take: 1,
      },
    },
  });

  const hasNextPage = rows.length > params.limit;

  return {
    items: hasNextPage ? rows.slice(0, params.limit) : rows,
    hasNextPage,
  };
};

/**
 * 현재 적용된 모든 필터 조건을 만족하는 견적 요청의 전체 개수 카운트
 */
export const countEstimateRequests = async (
  params: EstimateRequestFilterParams,
  db: DbClient = prisma
): Promise<number> => {
  return db.estimateRequest.count({
    where: buildWhere(params, new Date()),
  });
};

/**
 * moveType 별 개수 카운트
 */
export const countEstimateRequestsByMoveType = async (
  params: Omit<EstimateRequestFilterParams, 'moveTypes'>,
  db: DbClient = prisma
): Promise<Record<MoveType, number>> => {
  const where = buildWhere({ ...params, moveTypes: undefined }, new Date());

  const grouped = await db.estimateRequest.groupBy({
    by: ['moveType'],
    where,
    _count: { _all: true },
  });

  const counts = Object.fromEntries(
    Object.values(MoveType).map((moveType) => [moveType, 0])
  ) as Record<MoveType, number>;

  for (const row of grouped) {
    if (row.moveType) {
      counts[row.moveType] = row._count._all;
    }
  }

  return counts;
};

/**
 * 지정 견적 요청 개수 카운트
 */
export const countDesignatedEstimateRequests = async (
  params: Omit<EstimateRequestFilterParams, 'designated'>,
  db: DbClient = prisma
): Promise<number> => {
  const where = buildWhere({ ...params, designated: true }, new Date());
  return db.estimateRequest.count({ where });
};

/**
 * 서비스 지역 매칭 요청 개수 카운트
 */
export const countServiceAreaEstimateRequests = async (
  params: Omit<EstimateRequestFilterParams, 'serviceArea'>,
  db: DbClient = prisma
): Promise<number> => {
  const where = buildWhere({ ...params, serviceArea: true }, new Date());
  return db.estimateRequest.count({ where });
};
