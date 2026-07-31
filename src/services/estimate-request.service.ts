import type { MoveType } from '@prisma/client';
import {
  EstimateRequestStatus,
  MoveType as MoveTypeEnum,
  Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import * as estimateRequestRepository from '../repositories/estimate-request.repository';
import type {
  CustomerEstimateRequestRow,
  EstimateRequestCursor,
  EstimateRequestFilterParams,
  EstimateRequestListRow,
} from '../repositories/estimate-request.repository';
import {
  TOTAL_INPUT_STEPS,
  moveDateSchema,
  type EstimateRequestSort,
  type ReviseEstimateRequestFieldBody,
  type SaveEstimateRequestStepBody,
} from '../schemas/estimate-request.schema';
import { AppError } from '../utils/app.error';
import { inferRegionLabelFromAddress } from '../utils/region.util';
import * as notificationService from './notification.service';

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
  submittedAt: Date | null;
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
  submittedAt: row.submittedAt,
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
    input.sort === 'MOVE_DATE_ASC' ? lastRow?.moveDate : lastRow?.submittedAt;

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

// --- 일반 유저 견적요청 (DRAFT → SUBMITTED) ---
// 프로필 완료 검사는 requireCompletedCustomerProfile 미들웨어에서 처리

/**
 * Asia/Seoul 기준 오늘 날짜를 YYYY-MM-DD 로 반환
 */
const getTodayDateStringKst = (now = new Date()): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  return `${year}-${month}-${day}`;
};

/**
 * YYYY-MM-DD 를 Prisma @db.Date 비교용 UTC 자정 Date 로 변환
 */
const toUtcDateOnly = (dateString: string): Date => {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

/**
 * 이사일이 오늘(KST) 이전인지 검증 — 과거면 VALIDATION_ERROR
 */
const assertMoveDateNotPast = (moveDate: string): void => {
  const today = getTodayDateStringKst();

  if (moveDate < today) {
    throw new AppError('VALIDATION_ERROR', '과거 날짜는 선택할 수 없습니다.');
  }
};

/**
 * 제출에 필요한 필드가 모두 채워졌는지 확인
 */
const isReadyToSubmit = (row: CustomerEstimateRequestRow): boolean =>
  row.moveType != null &&
  row.moveDate != null &&
  row.departureZipCode != null &&
  row.departureAddress != null &&
  row.departureDetailAddress != null &&
  row.arrivalZipCode != null &&
  row.arrivalAddress != null &&
  row.arrivalDetailAddress != null;

/**
 * Date(@db.Date) → YYYY-MM-DD 문자열
 */
const formatDateOnly = (date: Date | null): string | null => {
  if (!date) return null;

  return date.toISOString().slice(0, 10);
};

/**
 * 활성 요청 요약 응답 형태
 */
const toActiveRequestSummary = (row: CustomerEstimateRequestRow) => ({
  id: row.id,
  status: row.status,
  currentStep: row.currentStep,
  totalSteps: row.totalSteps,
  moveType: row.moveType,
  moveDate: formatDateOnly(row.moveDate),
  departureAddress: row.departureAddress,
  arrivalAddress: row.arrivalAddress,
});

/**
 * 상세 조회 응답 형태
 */
const toEstimateRequestDetail = (row: CustomerEstimateRequestRow) => ({
  id: row.id,
  status: row.status,
  currentStep: row.currentStep,
  totalSteps: row.totalSteps,
  moveType: row.moveType,
  moveDate: formatDateOnly(row.moveDate),
  departureZipCode: row.departureZipCode,
  departureAddress: row.departureAddress,
  departureDetailAddress: row.departureDetailAddress,
  arrivalZipCode: row.arrivalZipCode,
  arrivalAddress: row.arrivalAddress,
  arrivalDetailAddress: row.arrivalDetailAddress,
});

/**
 * 본인 소유 DRAFT 요청인지 검증 후 행 반환
 */
const getOwnedDraftOrThrow = async (
  estimateRequestId: number,
  userId: string
): Promise<CustomerEstimateRequestRow> => {
  const row =
    await estimateRequestRepository.findEstimateRequestById(estimateRequestId);

  if (!row) {
    throw new AppError('ESTIMATE_REQUEST_NOT_FOUND');
  }

  if (row.userId !== userId) {
    throw new AppError('FORBIDDEN', '본인의 견적 요청만 수정할 수 있습니다.');
  }

  // DRAFT만 수정·제출 가능 — SUBMITTED는 기본 문구, 확정·완료는 통합 문구
  if (row.status !== EstimateRequestStatus.DRAFT) {
    if (row.status === EstimateRequestStatus.SUBMITTED) {
      throw new AppError('REQUEST_ALREADY_SUBMITTED');
    }

    throw new AppError(
      'REQUEST_ALREADY_SUBMITTED',
      '확정되었거나 완료된 견적 요청은 수정할 수 없습니다.'
    );
  }

  return row;
};

/**
 * 활성 견적요청 조회 — 없으면 hasActiveRequest: false
 */
export const getActiveEstimateRequest = async (userId: string) => {
  const todayStartUtc = toUtcDateOnly(getTodayDateStringKst());
  const active = await estimateRequestRepository.findActiveEstimateRequest(
    userId,
    todayStartUtc
  );

  if (!active) {
    return { hasActiveRequest: false as const, request: null };
  }

  return {
    hasActiveRequest: true as const,
    request: toActiveRequestSummary(active),
  };
};

/**
 * DRAFT 견적요청 생성 — 활성 요청이 있으면 409
 * 조회+생성을 트랜잭션으로 묶고, 유저당 DRAFT 1건 unique로 동시 생성 race condition을 차단
 */
export const createEstimateRequest = async (userId: string) => {
  const todayStartUtc = toUtcDateOnly(getTodayDateStringKst());

  try {
    return await prisma.$transaction(async (tx) => {
      const active = await estimateRequestRepository.findActiveEstimateRequest(
        userId,
        todayStartUtc,
        tx
      );

      if (active) {
        throw new AppError('ACTIVE_REQUEST_EXISTS');
      }

      const created =
        await estimateRequestRepository.createDraftEstimateRequest(userId, tx);

      return {
        id: created.id,
        status: created.status,
        currentStep: created.currentStep,
        totalSteps: created.totalSteps,
      };
    });
  } catch (error) {
    // 동시 생성으로 DRAFT unique 충돌 시에도 활성 요청 존재와 동일하게 처리
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new AppError('ACTIVE_REQUEST_EXISTS');
    }

    throw error;
  }
};

/**
 * 견적요청 상세 조회 — 본인만
 */
export const getEstimateRequestDetail = async (
  estimateRequestId: number,
  userId: string
) => {
  const row =
    await estimateRequestRepository.findEstimateRequestById(estimateRequestId);

  if (!row) {
    throw new AppError('ESTIMATE_REQUEST_NOT_FOUND');
  }

  if (row.userId !== userId) {
    throw new AppError('FORBIDDEN', '본인의 견적 요청만 조회할 수 있습니다.');
  }

  return toEstimateRequestDetail(row);
};

/**
 * 단계별 입력 저장 (step 1~3)
 * currentStep 은 뒤로 가지 않고 max(기존, min(step+1, 3)) 로만 전진
 */
export const saveEstimateRequestStep = async (
  estimateRequestId: number,
  userId: string,
  body: SaveEstimateRequestStepBody
) => {
  const existing = await getOwnedDraftOrThrow(estimateRequestId, userId);

  let updateData: Parameters<
    typeof estimateRequestRepository.updateEstimateRequestDraft
  >[2];

  if (body.step === 1) {
    updateData = { moveType: body.data.moveType };
  } else if (body.step === 2) {
    assertMoveDateNotPast(body.data.moveDate);
    updateData = { moveDate: toUtcDateOnly(body.data.moveDate) };
  } else {
    updateData = {
      departureZipCode: body.data.departureZipCode,
      departureAddress: body.data.departureAddress,
      departureDetailAddress: body.data.departureDetailAddress,
      arrivalZipCode: body.data.arrivalZipCode,
      arrivalAddress: body.data.arrivalAddress,
      arrivalDetailAddress: body.data.arrivalDetailAddress,
    };
  }

  // 입력 스텝은 TOTAL_INPUT_STEPS(3)까지 — 저장 후 다음 입력 단계로 전진 (완료 UI는 submit 후)
  const nextStep = Math.min(body.step + 1, TOTAL_INPUT_STEPS);
  const currentStep = Math.max(existing.currentStep, nextStep);

  // DRAFT 조건부 원자 갱신 — 선검사와 갱신 사이 경합 시 null
  const updated = await estimateRequestRepository.updateEstimateRequestDraft(
    estimateRequestId,
    userId,
    { ...updateData, currentStep }
  );

  if (!updated) {
    // 경합으로 DRAFT가 아니게 된 경우 등 — 재검증으로 적절한 에러 코드 반환
    await getOwnedDraftOrThrow(estimateRequestId, userId);
    throw new AppError('ESTIMATE_REQUEST_NOT_FOUND');
  }

  return {
    id: updated.id,
    currentStep: updated.currentStep,
    totalSteps: updated.totalSteps,
    isReadyToSubmit: isReadyToSubmit(updated),
  };
};

/**
 * moveType 문자열을 MoveType enum 으로 검증
 */
const parseMoveTypeValue = (value: string): MoveType => {
  if (
    value === MoveTypeEnum.SMALL ||
    value === MoveTypeEnum.HOME ||
    value === MoveTypeEnum.OFFICE
  ) {
    return value;
  }

  throw new AppError('VALIDATION_ERROR', '유효한 이사 종류를 선택해 주세요.');
};

/**
 * 완료 항목 단건 재수정 (DRAFT만)
 */
export const reviseEstimateRequestField = async (
  estimateRequestId: number,
  userId: string,
  body: ReviseEstimateRequestFieldBody
) => {
  await getOwnedDraftOrThrow(estimateRequestId, userId);

  const { field } = body;
  let updateData: Parameters<
    typeof estimateRequestRepository.updateEstimateRequestDraft
  >[2];

  if (field === 'moveType') {
    updateData = { moveType: parseMoveTypeValue(body.value) };
  } else if (field === 'moveDate') {
    // step 저장과 동일하게 moveDateSchema(달력 유효성 포함)로 검증
    const parsed = moveDateSchema.safeParse(body.value);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', '날짜 형식이 올바르지 않습니다.');
    }

    assertMoveDateNotPast(parsed.data);
    updateData = { moveDate: toUtcDateOnly(parsed.data) };
  } else {
    updateData = { [field]: body.value };
  }

  const updated = await estimateRequestRepository.updateEstimateRequestDraft(
    estimateRequestId,
    userId,
    updateData
  );

  if (!updated) {
    await getOwnedDraftOrThrow(estimateRequestId, userId);
    throw new AppError('ESTIMATE_REQUEST_NOT_FOUND');
  }

  // 응답에는 수정한 필드만 포함 (명세 예시: { id, moveDate })
  const response: Record<string, string | number | null> = {
    id: updated.id,
  };

  if (field === 'moveDate') {
    response.moveDate = formatDateOnly(updated.moveDate);
  } else if (field === 'moveType') {
    response.moveType = updated.moveType;
  } else {
    response[field] = updated[field];
  }

  return response;
};

/**
 * 견적요청 제출 — 필수값 검증 후 SUBMITTED 전환, currentStep=4
 */
export const submitEstimateRequest = async (
  estimateRequestId: number,
  userId: string
) => {
  const existing = await getOwnedDraftOrThrow(estimateRequestId, userId);

  if (!isReadyToSubmit(existing)) {
    throw new AppError('REQUIRED_FIELD_MISSING');
  }

  const submittedAt = new Date();
  // DRAFT 조건부 원자 제출 — 동시 이중 제출 race condition 차단
  const updated = await estimateRequestRepository.submitEstimateRequest(
    estimateRequestId,
    userId,
    submittedAt
  );

  if (!updated) {
    await getOwnedDraftOrThrow(estimateRequestId, userId);
    throw new AppError('ESTIMATE_REQUEST_NOT_FOUND');
  }

  // 지정 기사 알림 — 제출과 분리(알림 실패해도 제출은 유지)
  try {
    await notificationService.notifyDesignatedMoversOnEstimateSubmit({
      estimateRequestId: updated.id,
      customerId: userId,
      moveType: updated.moveType,
    });
  } catch (error) {
    console.error(
      `[submitEstimateRequest] designated mover notification failed id=${updated.id}`,
      error
    );
  }

  return {
    id: updated.id,
    status: updated.status,
    submittedAt:
      updated.submittedAt?.toISOString() ?? submittedAt.toISOString(),
  };
};
