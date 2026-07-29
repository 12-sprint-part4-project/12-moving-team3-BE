import {
  EstimateRequestStatus,
  Prisma,
  QuoteStatus,
  type Quote,
} from '@prisma/client';
import type {
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
  SENT_QUOTE_STATUSES,
  type PastQuoteFilter,
  type QuoteBody,
  type QuoteListStatus,
} from '../schemas/quote.schema';
import { AppError } from '../utils/app.error';
import { isMoveDateExpired } from '../utils/date.util';
import { toProfileImageUrl } from '../utils/profile-image.util';
import { inferDistrictLabelFromAddress } from '../utils/region.util';

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
 */
const getMaxProposalCount = (isDesignated: boolean): number =>
  isDesignated ? DESIGNATED_MAX_PROPOSALS : GENERAL_MAX_PROPOSALS;

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

  return quoteRepository.runInTransaction(async (tx) => {
    // 견적 요청 비관적 락 조회
    const estimateRequest = await quoteRepository.findEstimateRequestForUpdate(
      tx,
      estimateRequestId
    );

    // 견적 요청 존재 여부 검증
    if (!estimateRequest) {
      throw new AppError('ESTIMATE_REQUEST_NOT_FOUND');
    }

    // 이사일 경과 여부 검증
    if (isMoveDateExpired(estimateRequest.moveDate)) {
      throw new AppError('REQUEST_EXPIRED');
    }

    // 견적 확정된 요청은 보내기/반려 불가
    if (estimateRequest.confirmedQuoteId !== null) {
      throw new AppError('ALREADY_CONFIRMED_REQUEST');
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
        isDesignatedRequest: estimateRequest.isDesignated,
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
};

interface CreateProposalParams {
  tx: QuoteTransactionClient;
  moverId: string;
  estimateRequestId: number;
  body: Extract<QuoteBody, { type: 'PROPOSAL' }>;
  isDesignatedRequest: boolean;
  isDesignatedTarget: boolean;
  existingQuote: { id: number; status: QuoteStatus } | null;
}

/**
 * 견적 보내기(PROPOSAL) 처리
 */
const createProposal = async ({
  tx,
  moverId,
  estimateRequestId,
  body,
  isDesignatedRequest,
  isDesignatedTarget,
  existingQuote,
}: CreateProposalParams): Promise<Quote> => {
  // 지정 견적 요청인데 대상이 아닌 경우
  if (isDesignatedRequest && !isDesignatedTarget) {
    throw new AppError('NOT_DESIGNATED_TARGET');
  }

  assertNoExistingQuote(existingQuote);

  // 동적 마감 인원(지정 3 / 일반 5) 검증
  const activeProposalCount = await quoteRepository.countActiveProposals(
    tx,
    estimateRequestId
  );
  const maxProposalCount = getMaxProposalCount(isDesignatedRequest);

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
 * 반려 건은 마감 인원 카운트에서 제외
 */
const createRejection = async ({
  tx,
  moverId,
  estimateRequestId,
  body,
  isDesignatedTarget,
  existingQuote,
}: CreateRejectionParams): Promise<Quote> => {
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
 * 이사 완료 여부 판별
 */
const isMoveCompleted = (status: EstimateRequestStatus): boolean =>
  status === EstimateRequestStatus.COMPLETED;

/**
 * 견적 상세 응답 DTO 변환
 */
const toQuoteDetailDto = (quote: QuoteDetailRow): QuoteDetailDto => {
  const { estimateRequest } = quote;

  return {
    id: quote.id,
    estimateRequestId: quote.estimateRequestId,
    price: quote.price,
    isMoveCompleted: isMoveCompleted(estimateRequest.status),
    customer: { name: estimateRequest.user.name },
    moveType: estimateRequest.moveType,
    isDesignated: quote.isDesignated,
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
  quote: RejectedQuoteListRow
): RejectedQuoteListItemDto => {
  const { estimateRequest } = quote;

  return {
    id: quote.id,
    estimateRequestId: quote.estimateRequestId,
    customer: { name: estimateRequest.user.name },
    moveType: estimateRequest.moveType,
    isDesignated: quote.isDesignated,
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
const toSentQuoteListItem = (quote: SentQuoteListRow): SentQuoteListItemDto => {
  const { estimateRequest } = quote;

  return {
    id: quote.id,
    estimateRequestId: quote.estimateRequestId,
    customer: { name: estimateRequest.user.name },
    moveType: estimateRequest.moveType,
    isConfirmed: quote.status === QuoteStatus.CONFIRMED,
    isDesignated: quote.isDesignated,
    moveDate: estimateRequest.moveDate,
    fromRegionLabel: inferDistrictLabelFromAddress(
      estimateRequest.departureAddress
    ),
    toRegionLabel: inferDistrictLabelFromAddress(
      estimateRequest.arrivalAddress
    ),
    price: quote.price,
    isMoveCompleted: isMoveCompleted(estimateRequest.status),
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

  // 본인이 보낸 견적(PENDING/CONFIRMED)만 조회 가능하도록 권한 검증
  const isOwnSentQuote =
    quote.moverId === input.moverId &&
    SENT_QUOTE_STATUSES.includes(quote.status);

  if (!isOwnSentQuote) {
    throw new AppError('FORBIDDEN');
  }

  return toQuoteDetailDto(quote);
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

    return {
      items: items.map(toRejectedQuoteListItem),
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

  return {
    items: items.map(toSentQuoteListItem),
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
const toCustomerQuoteMoverDto = (
  mover: CustomerQuoteMoverRow
): CustomerQuoteMoverDto => ({
  moverId: mover.id,
  nickname: mover.nickname,
  profileImage: toProfileImageUrl(mover.profileImageKey),
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
const toCustomerQuoteItemDto = (
  quote: CustomerQuoteRow,
  moverMap: Map<string, CustomerQuoteMoverRow>
): CustomerQuoteItemDto | null => {
  if (!quote.moverId) return null;

  const mover = moverMap.get(quote.moverId);
  if (!mover) return null;

  return {
    quoteId: quote.id,
    price: quote.price,
    status: quote.status,
    isDesignated: quote.isDesignated,
    mover: toCustomerQuoteMoverDto(mover),
  };
};

/**
 * 견적 목록을 기사님 카드와 함께 DTO로 변환
 */
const mapCustomerQuoteItems = (
  quotes: CustomerQuoteRow[],
  moverMap: Map<string, CustomerQuoteMoverRow>
): CustomerQuoteItemDto[] =>
  quotes
    .map((quote) => toCustomerQuoteItemDto(quote, moverMap))
    .filter((item): item is CustomerQuoteItemDto => item != null);

/**
 * 견적 목록에 필요한 기사님 카드 일괄 조회·매핑
 */
const buildCustomerQuoteItems = async (
  quotes: CustomerQuoteRow[],
  customerId: string
): Promise<CustomerQuoteItemDto[]> => {
  const moverIds = quotes
    .map((quote) => quote.moverId)
    .filter((moverId): moverId is string => moverId != null);

  const moverMap = await quoteRepository.findMoverCardsByIds(
    moverIds,
    customerId
  );

  return mapCustomerQuoteItems(quotes, moverMap);
};

/**
 * 과거 견적 요청 그룹 DTO 변환
 */
const toPastQuoteGroupDto = (
  row: CustomerPastEstimateRequestRow,
  moverMap: Map<string, CustomerQuoteMoverRow>
): CustomerPastQuoteGroupDto => ({
  estimateRequestId: row.id,
  submittedAt: row.submittedAt,
  serviceType: row.moveType,
  moveDate: row.moveDate,
  fromAddress: inferDistrictLabelFromAddress(row.departureAddress),
  toAddress: inferDistrictLabelFromAddress(row.arrivalAddress),
  quotes: mapCustomerQuoteItems(row.quotes, moverMap),
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

  return rows.map((row) => toPastQuoteGroupDto(row, moverMap));
};

/**
 * 일반/지정 견적 건수 집계
 */
const countQuotesByDesignation = (
  quotes: Array<{ isDesignated: boolean }>
): { general: number; designated: number } =>
  quotes.reduce(
    (acc, quote) => {
      if (quote.isDesignated) {
        acc.designated += 1;
      } else {
        acc.general += 1;
      }
      return acc;
    },
    { general: 0, designated: 0 }
  );

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
    customerId
  );

  return {
    estimateRequestId: estimateRequest.id,
    status: estimateRequest.status,
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

  return {
    quoteId: quote.id,
    estimateRequestId: quote.estimateRequestId,
    price: quote.price,
    comment: quote.comment,
    status: quote.status,
    isDesignated: quote.isDesignated,
    serviceType: quote.estimateRequest.moveType,
    moveDate: quote.estimateRequest.moveDate,
    fromAddress: quote.estimateRequest.departureAddress,
    toAddress: quote.estimateRequest.arrivalAddress,
    mover: toCustomerQuoteMoverDto(mover),
  };
};
