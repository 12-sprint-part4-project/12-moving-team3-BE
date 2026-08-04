import {
  EstimateRequestStatus,
  MoveType,
  type Prisma,
  type Region,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  TOTAL_PROGRESS_STEPS,
  type EstimateRequestSort,
} from '../schemas/estimate-request.schema';
import { startOfDay } from '../utils/date.util';
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

/**
 * 기사님 프로필 존재 여부 확인
 */
export const existsMoverProfile = async (userId: string): Promise<boolean> => {
  const profile = await prisma.moverProfile.findUnique({
    where: { userId },
    select: { id: true },
  });

  return profile !== null;
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
  /** 1차 정렬 기준 값 (moveDate 또는 submittedAt) ISO 문자열 */
  value: string;
  /**
   * MOVE_DATE_ASC 전용 2차 정렬 값 (submittedAt ISO).
   * 이사일이 같을 때 최신 요청순(submittedAt desc) 커서에 사용한다.
   */
  secondaryValue?: string | null;
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
  submittedAt: Date | null;
  user: { id: string; name: string };
  designatedMovers: { id: number }[];
}

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
 * - 기본 제외 조건: SUBMITTED 상태가 아니거나, 견적이 확정되었거나, 이사일이 지났거나,
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
      confirmedQuoteId: null,
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

  const designatedCondition: Prisma.EstimateRequestWhereInput = {
    designatedMovers: { some: { moverId: params.moverId } },
  };

  if (params.designated && params.serviceArea) {
    conditions.push({
      OR: [
        designatedCondition,
        buildServiceAreaCondition(params.serviceRegions),
      ],
    });
  } else if (params.designated) {
    conditions.push(designatedCondition);
  } else if (params.serviceArea) {
    conditions.push(buildServiceAreaCondition(params.serviceRegions));
  }

  return { AND: conditions };
};

/**
 * 키셋(keyset) 방식의 커서 조건 생성
 * - SUBMITTED_AT_ASC: submittedAt ASC, id ASC
 * - MOVE_DATE_ASC: moveDate ASC, submittedAt DESC, id DESC
 */
const buildCursorCondition = (
  sort: EstimateRequestSort,
  cursor: EstimateRequestCursor
): Prisma.EstimateRequestWhereInput => {
  const cursorDate = new Date(cursor.value);

  if (sort === 'SUBMITTED_AT_ASC') {
    return {
      OR: [
        { submittedAt: { gt: cursorDate } },
        { submittedAt: cursorDate, id: { gt: cursor.id } },
      ],
    };
  }

  // MOVE_DATE_ASC — 이사일 오름차순, 동일 이사일은 submittedAt 최신순
  const secondaryDate =
    cursor.secondaryValue != null && cursor.secondaryValue !== ''
      ? new Date(cursor.secondaryValue)
      : null;

  if (secondaryDate == null || Number.isNaN(secondaryDate.getTime())) {
    return {
      OR: [
        { moveDate: { gt: cursorDate } },
        { moveDate: cursorDate, id: { lt: cursor.id } },
      ],
    };
  }

  return {
    OR: [
      { moveDate: { gt: cursorDate } },
      {
        AND: [
          { moveDate: cursorDate },
          { submittedAt: { lt: secondaryDate } },
        ],
      },
      {
        AND: [
          { moveDate: cursorDate },
          { submittedAt: secondaryDate },
          { id: { lt: cursor.id } },
        ],
      },
    ],
  };
};

const listSelect = {
  id: true,
  moveType: true,
  moveDate: true,
  departureAddress: true,
  arrivalAddress: true,
  submittedAt: true,
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
      ? [{ moveDate: 'asc' }, { submittedAt: 'desc' }, { id: 'desc' }]
      : [{ submittedAt: 'asc' }, { id: 'asc' }];

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
  const where = buildWhere(
    { ...params, designated: true, serviceArea: undefined },
    new Date()
  );
  return db.estimateRequest.count({ where });
};

/**
 * 서비스 지역 매칭 요청 개수 카운트
 */
export const countServiceAreaEstimateRequests = async (
  params: Omit<EstimateRequestFilterParams, 'serviceArea'>,
  db: DbClient = prisma
): Promise<number> => {
  const where = buildWhere(
    { ...params, serviceArea: true, designated: undefined },
    new Date()
  );
  return db.estimateRequest.count({ where });
};

// --- 일반 유저 견적요청 (DRAFT → SUBMITTED) ---

const customerDetailSelect = {
  id: true,
  userId: true,
  status: true,
  currentStep: true,
  totalSteps: true,
  moveType: true,
  moveDate: true,
  departureZipCode: true,
  departureAddress: true,
  departureDetailAddress: true,
  arrivalZipCode: true,
  arrivalAddress: true,
  arrivalDetailAddress: true,
  submittedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type CustomerEstimateRequestRow = Prisma.EstimateRequestGetPayload<{
  select: typeof customerDetailSelect;
}>;

/**
 * 활성 견적요청 where 조건
 * - DRAFT / SUBMITTED: 항상 활성
 * - CONFIRMED: 이사일(오늘 KST 기준)이 지나기 전까지 활성
 */
const buildActiveRequestWhere = (
  userId: string,
  todayStartUtc: Date
): Prisma.EstimateRequestWhereInput => ({
  userId,
  OR: [
    {
      status: {
        in: [EstimateRequestStatus.DRAFT, EstimateRequestStatus.SUBMITTED],
      },
    },
    {
      status: EstimateRequestStatus.CONFIRMED,
      moveDate: { gte: todayStartUtc },
    },
  ],
});

/**
 * 유저의 활성 견적요청 1건 조회 (없으면 null)
 */
export const findActiveEstimateRequest = async (
  userId: string,
  todayStartUtc: Date,
  db: DbClient = prisma
): Promise<CustomerEstimateRequestRow | null> => {
  return db.estimateRequest.findFirst({
    where: buildActiveRequestWhere(userId, todayStartUtc),
    orderBy: { createdAt: 'desc' },
    select: customerDetailSelect,
  });
};

/**
 * DRAFT 견적요청 생성 (step 1부터 시작)
 */
export const createDraftEstimateRequest = async (
  userId: string,
  db: DbClient = prisma
): Promise<CustomerEstimateRequestRow> => {
  return db.estimateRequest.create({
    data: {
      userId,
      status: EstimateRequestStatus.DRAFT,
      currentStep: 1,
      // FE 진행바 기준 전체 스텝(입력 3 + 제출 완료 1)
      totalSteps: TOTAL_PROGRESS_STEPS,
    },
    select: customerDetailSelect,
  });
};

/**
 * ID로 견적요청 상세 조회
 */
export const findEstimateRequestById = async (
  id: number,
  db: DbClient = prisma
): Promise<CustomerEstimateRequestRow | null> => {
  return db.estimateRequest.findUnique({
    where: { id },
    select: customerDetailSelect,
  });
};

/**
 * DRAFT 견적요청 필드 부분 업데이트 (단계 저장 / 재수정 공통)
 * id + userId + status=DRAFT 를 한 번에 조건으로 걸어 race condition(검사 후 갱신 사이 경합)을 막음
 * 조건에 맞는 행이 없으면 null (이미 제출됐거나 소유자가 다른 경우)
 */
export const updateEstimateRequestDraft = async (
  id: number,
  userId: string,
  data: Prisma.EstimateRequestUpdateManyMutationInput,
  db: DbClient = prisma
): Promise<CustomerEstimateRequestRow | null> => {
  const { count } = await db.estimateRequest.updateMany({
    where: { id, userId, status: EstimateRequestStatus.DRAFT },
    data,
  });

  if (count === 0) {
    return null;
  }

  return db.estimateRequest.findUnique({
    where: { id },
    select: customerDetailSelect,
  });
};

/**
 * DRAFT → SUBMITTED 전환
 * 소유자·DRAFT 조건을 갱신 where에 포함해 동시 제출/수정 race condition을 원자적으로 차단
 * 0건 갱신 시 null
 */
export const submitEstimateRequest = async (
  id: number,
  userId: string,
  submittedAt: Date,
  db: DbClient = prisma
): Promise<CustomerEstimateRequestRow | null> => {
  const { count } = await db.estimateRequest.updateMany({
    where: { id, userId, status: EstimateRequestStatus.DRAFT },
    data: {
      status: EstimateRequestStatus.SUBMITTED,
      submittedAt,
      // 제출 성공 시 FE 완료 화면(step 4)에 맞춤
      currentStep: TOTAL_PROGRESS_STEPS,
    },
  });

  if (count === 0) {
    return null;
  }

  return db.estimateRequest.findUnique({
    where: { id },
    select: customerDetailSelect,
  });
};

/**
 * 이사일(moveDate)이 기준일 이전인 SUBMITTED 요청을 EXPIRED로 일괄 전환
 * @returns 갱신된 행 수
 */
export const expireSubmittedEstimateRequestsPastMoveDate = async (
  todayStartUtc: Date,
  db: DbClient = prisma
): Promise<number> => {
  const { count } = await db.estimateRequest.updateMany({
    where: {
      status: EstimateRequestStatus.SUBMITTED,
      moveDate: { lt: todayStartUtc },
    },
    data: {
      status: EstimateRequestStatus.EXPIRED,
    },
  });

  return count;
};
