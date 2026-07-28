import { QuoteStatus, type Quote } from '@prisma/client';
import * as quoteRepository from '../repositories/quote.repository';
import type { QuoteTransactionClient } from '../repositories/quote.repository';
import type { QuoteBody } from '../schemas/quote.schema';
import { AppError } from '../utils/app.error';
import { isMoveDateExpired } from '../utils/date.util';

/** 지정 견적 요청 최대 PROPOSAL 수 */
const DESIGNATED_MAX_PROPOSALS = 3;

/** 일반 견적 요청 최대 PROPOSAL 수 */
const GENERAL_MAX_PROPOSALS = 5;

export interface SubmitQuoteInput {
  moverId: string;
  estimateRequestId: number;
  body: QuoteBody;
}

/**
 * 지정/일반 견적 최대 제출 가능 인원 반환
 */
const getMaxProposalCount = (isDesignated: boolean): number =>
  isDesignated ? DESIGNATED_MAX_PROPOSALS : GENERAL_MAX_PROPOSALS;

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
  return quoteRepository.createQuote(tx, {
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
  return quoteRepository.createQuote(tx, {
    estimateRequestId,
    moverId,
    status: QuoteStatus.REJECTED,
    isDesignated: isDesignatedTarget,
    rejectReason: body.rejectReason,
  });
};
