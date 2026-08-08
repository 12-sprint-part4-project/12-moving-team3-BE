import {
  EstimateRequestStatus,
  Prisma,
  QuoteStatus,
  type Quote,
} from '@prisma/client';
import type {
  ConfirmQuoteDto,
  CustomerPastQuoteGroupDto,
  CustomerPastQuotesResultDto,
  CustomerPendingQuotesDto,
  CustomerQuoteDetailDto,
  CustomerQuoteItemDto,
  CustomerQuoteMoverDto,
  QuoteDetailDto,
  QuoteListResultDto,
  RejectedQuoteListItemDto,
  SentQuoteListItemDto,
} from '../dtos/quote.dto';
import { existsMoverProfile } from '../repositories/estimate-request.repository';
import * as designatedEstimateRequestRepository from '../repositories/designated-estimate-request.repository';
import * as quoteRepository from '../repositories/quote.repository';
import type {
  CreateQuoteData,
  CustomerPastEstimateRequestRow,
  CustomerQuoteMoverRow,
  CustomerQuoteRow,
  FindCustomerPastEstimateRequestsParams,
  QuoteDetailRow,
  QuoteTransactionClient,
  RejectedQuoteListRow,
  SentQuoteListRow,
} from '../repositories/quote.repository';
import {
  PAST_QUOTE_FILTER_VALUES,
  MOVER_QUOTE_DETAIL_STATUSES,
  SENT_QUOTE_STATUSES,
  type PastQuoteFilter,
  type QuoteBody,
  type QuoteListStatus,
} from '../schemas/quote.schema';
import { AppError } from '../utils/app.error';
import { isMoveDateExpired } from '../utils/date.util';
import { countQuotesByDesignation } from '../utils/quote-count.util';
import { inferDistrictLabelFromAddress } from '../utils/region.util';
import * as notificationService from './notification.service';
import { toPublicViewUrl } from './s3.service';

// --- [기사님(MOVER)용 API] ---

/** 지정 견적 요청 최대 PROPOSAL 수 */
const DESIGNATED_MAX_PROPOSALS = 3;

/** 일반 견적 요청 최대 PROPOSAL 수 */
const GENERAL_MAX_PROPOSALS = 5;

export interface SubmitQuoteInput {
  moverId: string;
  estimateRequestId: number;
  body: QuoteBody;
}

export interface GetQuoteDetailInput {
  moverId: string;
  quoteId: number;
}

export interface GetQuotesInput {
  moverId: string;
  status: QuoteListStatus;
  page: number;
  limit: number;
}

/**
 * 지정/일반 견적 최대 제출 가능 인원 반환
 * — 제출하려는 견적 유형(기사님 지정 여부) 기준
 */
const getMaxProposalCount = (isDesignatedQuote: boolean): number =>
  isDesignatedQuote ? DESIGNATED_MAX_PROPOSALS : GENERAL_MAX_PROPOSALS;

/**
 * Prisma P2002(Unique Constraint) 여부 판별
 */
const isUniqueConstraintError = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';

/**
 * Prisma P2025(Record not found) 여부 판별 — 잘못된 커서 등
 */
const isRecordNotFoundError = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2025';

/**
 * 동일 무버의 기존 견적/반려 여부 검증
 */
const assertNoExistingQuote = (
  existingQuote: { id: number; status: QuoteStatus } | null
): void => {
  if (!existingQuote) {
    return;
  }

  if (existingQuote.status === QuoteStatus.REJECTED) {
    throw new AppError('ALREADY_REJECTED');
  }

  throw new AppError('QUOTE_ALREADY_SUBMITTED');
};

/**
 * 견적 보내기/확정은 SUBMITTED 요청만 허용
 * EXPIRED·CANCELED·확정·완료는 각각 전용 에러로 분기
 */
const assertSubmittedEstimateRequest = (
  status: EstimateRequestStatus,
  confirmedQuoteId: number | null
): void => {
  if (status === EstimateRequestStatus.EXPIRED) {
    throw new AppError('REQUEST_EXPIRED');
  }

  if (status === EstimateRequestStatus.CANCELED) {
    throw new AppError('REQUEST_CANCELED');
  }

  if (
    confirmedQuoteId !== null ||
    status === EstimateRequestStatus.CONFIRMED ||
    status === EstimateRequestStatus.COMPLETED
  ) {
    throw new AppError('ALREADY_CONFIRMED_REQUEST');
  }

  if (status !== EstimateRequestStatus.SUBMITTED) {
    throw new AppError('ESTIMATE_REQUEST_NOT_FOUND');
  }
};

/**
 * 견적 생성. 복합 유니크 위반 시 QUOTE_ALREADY_SUBMITTED 로 변환
 */
const createQuote = async (
  tx: QuoteTransactionClient,
  data: CreateQuoteData
): Promise<Quote> => {
  try {
    return await quoteRepository.createQuote(tx, data);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppError('QUOTE_ALREADY_SUBMITTED');
    }

    throw error;
  }
};

/**
 * 견적 보내기 / 반려하기 유스케이스
 * type 필드에 따라 PROPOSAL | REJECTION 분기 처리
 */
export const submitQuote = async (input: SubmitQuoteInput): Promise<Quote> => {
  const { moverId, estimateRequestId, body } = input;

  const quote = await quoteRepository.runInTransaction(async (tx) => {
    // 견적 요청 비관적 락 조회
    const estimateRequest = await quoteRepository.findEstimateRequestForUpdate(
      tx,
      estimateRequestId
    );

    // 견적 요청 존재 여부 검증
    if (!estimateRequest) {
      throw new AppError('ESTIMATE_REQUEST_NOT_FOUND');
    }

    // SUBMITTED만 견적 보내기/반려 가능 (EXPIRED·CANCELED·확정 등 차단)
    assertSubmittedEstimateRequest(
      estimateRequest.status,
      estimateRequest.confirmedQuoteId
    );

    // 이사일 경과 여부 검증 (cron 전 SUBMITTED도 차단)
    if (isMoveDateExpired(estimateRequest.moveDate)) {
      throw new AppError('REQUEST_EXPIRED');
    }

    // 지정 견적 대상 여부 조회
    const isDesignatedTarget = await quoteRepository.isDesignatedMover(
      tx,
      estimateRequestId,
      moverId
    );

    // 동일 무버 기존 견적 조회
    const existingQuote = await quoteRepository.findExistingQuote(
      tx,
      estimateRequestId,
      moverId
    );

    // type 기준 기능 분기
    if (body.type === 'PROPOSAL') {
      return createProposal({
        tx,
        moverId,
        estimateRequestId,
        body,
        isDesignatedTarget,
        existingQuote,
      });
    }

    return createRejection({
      tx,
      moverId,
      estimateRequestId,
      body,
      isDesignatedTarget,
      existingQuote,
    });
  });

  // 견적 제안 알림 — 커밋 이후 호출(실패해도 견적 트랜잭션은 유지)
  if (body.type === 'PROPOSAL') {
    try {
      await notificationService.notifyQuoteOfferArrivedByQuoteId(quote.id);
    } catch (error) {
      console.error(
        `[submitQuote] quote offer notification failed quoteId=${quote.id}`,
        error
      );
    }
  }

  // 지정 견적 반려 알림 — 지정 REJECTION만 고객에게
  if (body.type === 'REJECTION' && quote.isDesignated) {
    try {
      await notificationService.notifyDesignatedQuoteRejectedByQuoteId(
        quote.id
      );
    } catch (error) {
      console.error(
        `[submitQuote] designated rejection notification failed quoteId=${quote.id}`,
        error
      );
    }
  }

  return quote;
};

interface CreateProposalParams {
  tx: QuoteTransactionClient;
  moverId: string;
  estimateRequestId: number;
  body: Extract<QuoteBody, { type: 'PROPOSAL' }>;
  isDesignatedTarget: boolean;
  existingQuote: { id: number; status: QuoteStatus } | null;
}

/**
 * 견적 보내기(PROPOSAL) 처리
 * 지정 견적·일반 견적은 각각 독립 한도(지정 3 / 일반 5)로 마감 검증
 */
const createProposal = async ({
  tx,
  moverId,
  estimateRequestId,
  body,
  isDesignatedTarget,
  existingQuote,
}: CreateProposalParams): Promise<Quote> => {
  assertNoExistingQuote(existingQuote);

  // 동일 유형(지정/일반) 활성 견적만 집계해 한도 검증
  const activeProposalCount = await quoteRepository.countActiveProposals(
    tx,
    estimateRequestId,
    isDesignatedTarget
  );
  const maxProposalCount = getMaxProposalCount(isDesignatedTarget);

  if (activeProposalCount >= maxProposalCount) {
    throw new AppError('REQUEST_CLOSED');
  }

  // PENDING 견적 생성
  return createQuote(tx, {
    estimateRequestId,
    moverId,
    status: QuoteStatus.PENDING,
    isDesignated: isDesignatedTarget,
    price: body.price,
    comment: body.comment,
  });
};

interface CreateRejectionParams {
  tx: QuoteTransactionClient;
  moverId: string;
  estimateRequestId: number;
  body: Extract<QuoteBody, { type: 'REJECTION' }>;
  isDesignatedTarget: boolean;
  existingQuote: { id: number; status: QuoteStatus } | null;
}

/**
 * 반려하기(REJECTION) 처리
 * 지정 견적 요청만 반려 가능. 반려 건은 마감 인원 카운트에서 제외
 */
const createRejection = async ({
  tx,
  moverId,
  estimateRequestId,
  body,
  isDesignatedTarget,
  existingQuote,
}: CreateRejectionParams): Promise<Quote> => {
  // 일반 요청은 반려 불가 — 지정 견적 대상만 허용
  if (!isDesignatedTarget) {
    throw new AppError('NOT_DESIGNATED_TARGET');
  }

  assertNoExistingQuote(existingQuote);

  // REJECTED 견적 생성
  return createQuote(tx, {
    estimateRequestId,
    moverId,
    status: QuoteStatus.REJECTED,
    isDesignated: isDesignatedTarget,
    rejectReason: body.rejectReason,
  });
};

/**
 * 보낸 견적 카드 종료 오버레이 대상
 */
const isClosedEstimateRequestCard = (status: EstimateRequestStatus): boolean =>
  status === EstimateRequestStatus.COMPLETED ||
  status === EstimateRequestStatus.EXPIRED ||
  status === EstimateRequestStatus.CANCELED;

/**
 * 견적 상세 DTO 변환
 */
const toQuoteDetailDto = (
  quote: QuoteDetailRow,
  designatedMoverId: number | null
): QuoteDetailDto => {
  const { estimateRequest } = quote;

  return {
    id: quote.id,
    estimateRequestId: quote.estimateRequestId,
    price: quote.price,
    status: quote.status,
    rejectReason: quote.rejectReason,
    estimateRequestStatus: estimateRequest.status,
    isMoveCompleted: isClosedEstimateRequestCard(estimateRequest.status),
    customer: { name: estimateRequest.user.name },
    moveType: estimateRequest.moveType,
    isDesignated: quote.isDesignated,
    designatedMoverId,
    requestedAt: estimateRequest.submittedAt ?? estimateRequest.createdAt,
    moveDate: estimateRequest.moveDate,
    fromAddress: estimateRequest.departureAddress,
    toAddress: estimateRequest.arrivalAddress,
  };
};

/**
 * 반려 견적 목록 아이템 DTO 변환
 */
const toRejectedQuoteListItem = (
  quote: RejectedQuoteListRow,
  designatedMoverId: number | null
): RejectedQuoteListItemDto => {
  const { estimateRequest } = quote;

  return {
    id: quote.id,
    estimateRequestId: quote.estimateRequestId,
    customer: { name: estimateRequest.user.name },
    moveType: estimateRequest.moveType,
    isDesignated: quote.isDesignated,
    designatedMoverId,
    moveDate: estimateRequest.moveDate,
    fromRegionLabel: inferDistrictLabelFromAddress(
      estimateRequest.departureAddress
    ),
    toRegionLabel: inferDistrictLabelFromAddress(
      estimateRequest.arrivalAddress
    ),
    createdAt: quote.createdAt,
  };
};

/**
 * 보낸 견적 목록 아이템 DTO 변환
 */
const toSentQuoteListItem = (
  quote: SentQuoteListRow,
  designatedMoverId: number | null
): SentQuoteListItemDto => {
  const { estimateRequest } = quote;

  return {
    id: quote.id,
    estimateRequestId: quote.estimateRequestId,
    customer: { name: estimateRequest.user.name },
    moveType: estimateRequest.moveType,
    isConfirmed: quote.status === QuoteStatus.CONFIRMED,
    isDesignated: quote.isDesignated,
    designatedMoverId,
    moveDate: estimateRequest.moveDate,
    fromRegionLabel: inferDistrictLabelFromAddress(
      estimateRequest.departureAddress
    ),
    toRegionLabel: inferDistrictLabelFromAddress(
      estimateRequest.arrivalAddress
    ),
    price: quote.price,
    estimateRequestStatus: estimateRequest.status,
    isMoveCompleted: isClosedEstimateRequestCard(estimateRequest.status),
    createdAt: quote.createdAt,
  };
};

/**
 * 견적 상세 조회
 */
export const getQuoteDetail = async (
  input: GetQuoteDetailInput
): Promise<QuoteDetailDto> => {
  const quote = await quoteRepository.findQuoteById(input.quoteId);

  // 존재하지 않거나 삭제된 견적 처리
  if (!quote) {
    throw new AppError('QUOTE_NOT_FOUND');
  }

  // 본인 견적(PENDING/CONFIRMED/REJECTED)만 조회 가능하도록 권한 검증
  const isOwnQuote =
    quote.moverId === input.moverId &&
    MOVER_QUOTE_DETAIL_STATUSES.includes(quote.status);

  if (!isOwnQuote) {
    throw new AppError('FORBIDDEN');
  }

  const designated =
    await designatedEstimateRequestRepository.findByEstimateIdAndMoverId(
      quote.estimateRequestId,
      input.moverId
    );

  return toQuoteDetailDto(quote, designated?.id ?? null);
};

/**
 * 보낸 견적 / 반려한 견적 목록 조회
 * status 쿼리 기준 분기 및 offset 페이지네이션 적용
 */
export const getQuotes = async (
  input: GetQuotesInput
): Promise<QuoteListResultDto> => {
  // 프로필 존재 여부만 확인
  const hasProfile = await existsMoverProfile(input.moverId);

  if (!hasProfile) {
    throw new AppError('PROFILE_NOT_REGISTERED');
  }

  const skip = (input.page - 1) * input.limit;

  // status 분기별 최소 필드 조회 및 DTO 매핑
  if (input.status === 'REJECTED') {
    const { items, totalCount } =
      await quoteRepository.findQuotesByMoverWithCount({
        moverId: input.moverId,
        listStatus: 'REJECTED',
        skip,
        take: input.limit,
      });

    const designatedByEstimateId =
      await designatedEstimateRequestRepository.findIdsByEstimateIdsAndMoverId(
        items.map((item) => item.estimateRequestId),
        input.moverId
      );

    return {
      items: items.map((item) =>
        toRejectedQuoteListItem(
          item,
          designatedByEstimateId.get(item.estimateRequestId) ?? null
        )
      ),
      meta: buildPaginationMeta(totalCount, input.page, input.limit),
    };
  }

  const { items, totalCount } =
    await quoteRepository.findQuotesByMoverWithCount({
      moverId: input.moverId,
      listStatus: 'SENT',
      skip,
      take: input.limit,
    });

  const designatedByEstimateId =
    await designatedEstimateRequestRepository.findIdsByEstimateIdsAndMoverId(
      items.map((item) => item.estimateRequestId),
      input.moverId
    );

  return {
    items: items.map((item) =>
      toSentQuoteListItem(
        item,
        designatedByEstimateId.get(item.estimateRequestId) ?? null
      )
    ),
    meta: buildPaginationMeta(totalCount, input.page, input.limit),
  };
};

/**
 * 페이지네이션 메타데이터 생성
 */
const buildPaginationMeta = (
  totalCount: number,
  currentPage: number,
  limit: number
): QuoteListResultDto['meta'] => {
  const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / limit);

  return {
    totalCount,
    totalPages,
    currentPage,
    limit,
    hasNextPage: currentPage < totalPages,
    hasPrevPage: currentPage > 1 && totalCount > 0,
  };
};

// --- [일반 유저(CUSTOMER)용 API] ---

export interface GetCustomerPastQuotesInput {
  customerId: string;
  cursor?: number;
  limit: number;
  estimateRequestId?: number;
  filter: string;
}

export interface GetCustomerQuoteDetailInput {
  customerId: string;
  quoteId: number;
}

export interface ConfirmQuoteInput {
  customerId: string;
  quoteId: number;
}

/**
 * 과거 견적 filter 값 타입 가드
 */
const isPastQuoteFilter = (value: string): value is PastQuoteFilter =>
  (PAST_QUOTE_FILTER_VALUES as readonly string[]).includes(value);

/**
 * filter 기준 고객 견적 상태 배열 반환
 */
const resolveCustomerQuoteStatuses = (
  filter: PastQuoteFilter
): QuoteStatus[] => {
  if (filter === 'CONFIRMED') {
    return [QuoteStatus.CONFIRMED];
  }

  return SENT_QUOTE_STATUSES;
};

/** 과거 견적 요청으로 조회할 EstimateRequest 상태 */
const PAST_ESTIMATE_REQUEST_STATUSES: EstimateRequestStatus[] = [
  EstimateRequestStatus.CONFIRMED,
  EstimateRequestStatus.COMPLETED,
  EstimateRequestStatus.EXPIRED,
  EstimateRequestStatus.CANCELED,
];

/**
 * 과거 견적 요청 목록 조회
 * 잘못된 커서는 Prisma P2025 → INVALID_QUERY_PARAM 으로 변환
 */
const findPastEstimateRequestsOrThrow = async (
  params: FindCustomerPastEstimateRequestsParams
) => {
  try {
    return await quoteRepository.findCustomerPastEstimateRequests(params);
  } catch (error) {
    if (isRecordNotFoundError(error)) {
      throw new AppError('INVALID_QUERY_PARAM');
    }
    throw error;
  }
};

/**
 * 리뷰 합계로 평균 평점 산출 (소수 1자리)
 */
const toAverageRating = (ratingSum: number, reviewCount: number): number => {
  if (reviewCount === 0) return 0;
  return Math.round((ratingSum / reviewCount) * 10) / 10;
};

/**
 * 기사님 카드 DTO 변환
 */
const toCustomerQuoteMoverDto = async (
  mover: CustomerQuoteMoverRow
): Promise<CustomerQuoteMoverDto> => ({
  moverId: mover.id,
  nickname: mover.nickname,
  profileImage: toPublicViewUrl(mover.profileImageKey),
  shortDescription: mover.shortDescription,
  rating: toAverageRating(mover.ratingSum, mover.reviewCount),
  reviewCount: mover.reviewCount,
  career: mover.career,
  confirmedQuoteCount: mover.confirmedQuoteCount,
  favoriteCount: mover.favoriteCount,
  isFavorited: mover.isFavorited,
});

/**
 * 고객 견적 아이템 DTO 변환
 */
const toCustomerQuoteItemDto = async (
  quote: CustomerQuoteRow,
  moverMap: Map<string, CustomerQuoteMoverRow>,
  designatedByMoverId: Map<string, number>
): Promise<CustomerQuoteItemDto | null> => {
  if (!quote.moverId) return null;

  const mover = moverMap.get(quote.moverId);
  if (!mover) return null;

  return {
    quoteId: quote.id,
    price: quote.price,
    status: quote.status,
    isDesignated: quote.isDesignated,
    designatedMoverId: designatedByMoverId.get(quote.moverId) ?? null,
    mover: await toCustomerQuoteMoverDto(mover),
  };
};

/**
 * 견적 목록을 기사님 카드와 함께 DTO로 변환
 */
const mapCustomerQuoteItems = async (
  quotes: CustomerQuoteRow[],
  moverMap: Map<string, CustomerQuoteMoverRow>,
  designatedByMoverId: Map<string, number>
): Promise<CustomerQuoteItemDto[]> => {
  const items = await Promise.all(
    quotes.map((quote) =>
      toCustomerQuoteItemDto(quote, moverMap, designatedByMoverId)
    )
  );

  return items.filter((item): item is CustomerQuoteItemDto => item != null);
};

/**
 * 견적 목록에 필요한 기사님 카드 일괄 조회·매핑
 */
const buildCustomerQuoteItems = async (
  quotes: CustomerQuoteRow[],
  customerId: string,
  designatedByMoverId: Map<string, number>
): Promise<CustomerQuoteItemDto[]> => {
  const moverIds = quotes
    .map((quote) => quote.moverId)
    .filter((moverId): moverId is string => moverId != null);

  const moverMap = await quoteRepository.findMoverCardsByIds(
    moverIds,
    customerId
  );

  return mapCustomerQuoteItems(quotes, moverMap, designatedByMoverId);
};

/**
 * 도로명·지번 주소와 상세주소(동·호수)를 합친 전체 주소
 */
const toFullAddressLabel = (
  address: string | null,
  detailAddress: string | null
): string | null => {
  const parts = [address, detailAddress]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(' ') : null;
};

/**
 * designatedMovers 배열 → moverId → designatedMoverId 맵
 */
const toDesignatedByMoverIdMap = (
  designatedMovers: Array<{ id: number; moverId: string }>
): Map<string, number> =>
  new Map(designatedMovers.map((row) => [row.moverId, row.id]));

/**
 * 과거 견적 요청 그룹 DTO 변환
 */
const toPastQuoteGroupDto = async (
  row: CustomerPastEstimateRequestRow,
  moverMap: Map<string, CustomerQuoteMoverRow>
): Promise<CustomerPastQuoteGroupDto> => ({
  estimateRequestId: row.id,
  status: row.status,
  submittedAt: row.submittedAt,
  confirmedAt: row.confirmedAt,
  serviceType: row.moveType,
  moveDate: row.moveDate,
  fromAddress: toFullAddressLabel(
    row.departureAddress,
    row.departureDetailAddress
  ),
  toAddress: toFullAddressLabel(row.arrivalAddress, row.arrivalDetailAddress),
  quotes: await mapCustomerQuoteItems(
    row.quotes,
    moverMap,
    toDesignatedByMoverIdMap(row.designatedMovers)
  ),
});

/**
 * 과거 견적 요청 그룹 목록을 기사님 카드와 함께 매핑
 */
const buildPastQuoteGroups = async (
  rows: CustomerPastEstimateRequestRow[],
  customerId: string
): Promise<CustomerPastQuoteGroupDto[]> => {
  const moverIds = rows
    .flatMap((row) => row.quotes)
    .map((quote) => quote.moverId)
    .filter((moverId): moverId is string => moverId != null);

  const moverMap = await quoteRepository.findMoverCardsByIds(
    moverIds,
    customerId
  );

  return Promise.all(rows.map((row) => toPastQuoteGroupDto(row, moverMap)));
};

/**
 * 대기 중인 견적 리스트 조회
 * SUBMITTED 요청이 없으면 null 반환
 */
export const getCustomerPendingQuotes = async (
  customerId: string
): Promise<CustomerPendingQuotesDto | null> => {
  const estimateRequest =
    await quoteRepository.findPendingEstimateRequestWithQuotes(customerId);

  if (!estimateRequest) {
    return null;
  }

  const quotes = await buildCustomerQuoteItems(
    estimateRequest.quotes,
    customerId,
    toDesignatedByMoverIdMap(estimateRequest.designatedMovers)
  );

  return {
    estimateRequestId: estimateRequest.id,
    status: estimateRequest.status,
    submittedAt: estimateRequest.submittedAt,
    serviceType: estimateRequest.moveType,
    moveDate: estimateRequest.moveDate,
    fromAddress: inferDistrictLabelFromAddress(
      estimateRequest.departureAddress
    ),
    toAddress: inferDistrictLabelFromAddress(estimateRequest.arrivalAddress),
    quoteCount: countQuotesByDesignation(quotes),
    quotes,
  };
};

/**
 * 받았던 견적(과거) 리스트 조회
 * estimateRequestId 존재 시 해당 요청 블록만 필터링
 */
export const getCustomerPastQuotes = async (
  input: GetCustomerPastQuotesInput
): Promise<CustomerPastQuotesResultDto> => {
  if (!isPastQuoteFilter(input.filter)) {
    throw new AppError('INVALID_FILTER_TYPE');
  }

  const { items: rows, hasNextPage } = await findPastEstimateRequestsOrThrow({
    customerId: input.customerId,
    cursor: input.cursor,
    limit: input.limit,
    estimateRequestId: input.estimateRequestId,
    estimateRequestStatuses: PAST_ESTIMATE_REQUEST_STATUSES,
    quoteStatuses: resolveCustomerQuoteStatuses(input.filter),
  });

  // 단건 필터인데 소유 요청이 없으면 ESTIMATE_REQUEST_NOT_FOUND 처리
  if (input.estimateRequestId != null && rows.length === 0) {
    throw new AppError('ESTIMATE_REQUEST_NOT_FOUND');
  }

  const items = await buildPastQuoteGroups(rows, input.customerId);
  const lastItem = items[items.length - 1];

  return {
    items,
    meta: {
      nextCursor: hasNextPage && lastItem ? lastItem.estimateRequestId : null,
      hasNextPage,
    },
  };
};

/**
 * 고객 견적 상세 조회
 */
export const getCustomerQuoteDetail = async (
  input: GetCustomerQuoteDetailInput
): Promise<CustomerQuoteDetailDto> => {
  const quote = await quoteRepository.findCustomerQuoteById(
    input.quoteId,
    input.customerId
  );

  if (!quote?.moverId) {
    throw new AppError('QUOTE_NOT_FOUND');
  }

  const moverMap = await quoteRepository.findMoverCardsByIds(
    [quote.moverId],
    input.customerId
  );
  const mover = moverMap.get(quote.moverId);

  if (!mover) {
    throw new AppError('MOVER_NOT_FOUND');
  }

  const designated =
    quote.moverId != null
      ? await designatedEstimateRequestRepository.findByEstimateIdAndMoverId(
          quote.estimateRequestId,
          quote.moverId
        )
      : null;

  return {
    quoteId: quote.id,
    estimateRequestId: quote.estimateRequestId,
    price: quote.price,
    comment: quote.comment,
    status: quote.status,
    isDesignated: quote.isDesignated,
    designatedMoverId: designated?.id ?? null,
    estimateRequestStatus: quote.estimateRequest.status,
    serviceType: quote.estimateRequest.moveType,
    moveDate: quote.estimateRequest.moveDate,
    submittedAt: quote.estimateRequest.submittedAt,
    fromAddress: quote.estimateRequest.departureAddress,
    toAddress: quote.estimateRequest.arrivalAddress,
    mover: await toCustomerQuoteMoverDto(mover),
  };
};

/**
 * 견적 확정
 * Quote·EstimateRequest 상태 변경 및 confirmedQuoteId 업데이트를 트랜잭션으로 처리
 */
export const confirmQuote = async (
  input: ConfirmQuoteInput
): Promise<ConfirmQuoteDto> => {
  const { customerId, quoteId } = input;

  const result = await quoteRepository.runInTransaction(async (tx) => {
    // 고객 소유 견적 조회
    const quote = await quoteRepository.findCustomerQuoteForConfirm(
      tx,
      quoteId,
      customerId
    );

    if (!quote) {
      throw new AppError('QUOTE_NOT_FOUND');
    }

    // 이사 요청 비관적 락 조회
    const estimateRequest = await quoteRepository.findEstimateRequestForUpdate(
      tx,
      quote.estimateRequestId
    );

    if (!estimateRequest) {
      throw new AppError('ESTIMATE_REQUEST_NOT_FOUND');
    }

    // SUBMITTED만 확정 가능 (EXPIRED·CANCELED는 전용 에러)
    assertSubmittedEstimateRequest(
      estimateRequest.status,
      estimateRequest.confirmedQuoteId
    );

    if (quote.status !== QuoteStatus.PENDING) {
      throw new AppError('ALREADY_CONFIRMED_REQUEST');
    }

    // 이사일 경과 여부 검증 (cron 전 SUBMITTED도 차단)
    if (isMoveDateExpired(estimateRequest.moveDate)) {
      throw new AppError('REQUEST_EXPIRED');
    }

    // 견적·이사 요청 상태 업데이트
    const confirmed = await quoteRepository.confirmQuoteWithEstimateRequest(
      tx,
      quoteId,
      quote.estimateRequestId
    );

    if (!confirmed) {
      throw new AppError('ALREADY_CONFIRMED_REQUEST');
    }

    return { confirmedQuoteId: quoteId };
  });

  // 확정 알림(고객·기사) — 커밋 이후 호출(실패해도 확정은 유지)
  try {
    await notificationService.notifyQuoteConfirmedByQuoteId(quoteId);
  } catch (error) {
    console.error(
      `[confirmQuote] quote confirmed notification failed quoteId=${quoteId}`,
      error
    );
  }

  return result;
};
