import {
  Prisma,
  QuoteStatus,
  type EstimateRequestStatus,
  type Quote,
} from '@prisma/client';
import { prisma } from '../lib/prisma';

/** 비관적 락으로 조회한 견적 요청 행 */
export interface LockedEstimateRequest {
  id: number;
  moveDate: Date | null;
  status: EstimateRequestStatus;
  confirmedQuoteId: number | null;
  isDesignated: boolean;
}

/** 견적 생성 입력 */
export interface CreateQuoteData {
  estimateRequestId: number;
  moverId: string;
  status: QuoteStatus;
  isDesignated: boolean;
  price?: number;
  comment?: string;
  rejectReason?: string;
}

export type QuoteTransactionClient = Prisma.TransactionClient;

/**
 * 견적 요청 행에 SELECT FOR UPDATE 비관적 락 적용 후 조회
 * 지정견적 여부는 estimate_designated_movers 존재 여부로 판별
 */
export const findEstimateRequestForUpdate = async (
  tx: QuoteTransactionClient,
  estimateRequestId: number
): Promise<LockedEstimateRequest | null> => {
  const rows = await tx.$queryRaw<LockedEstimateRequest[]>`
    SELECT
      er.id,
      er.move_date AS "moveDate",
      er.status,
      er.confirmed_quote_id AS "confirmedQuoteId",
      EXISTS (
        SELECT 1
        FROM estimate_designated_movers edm
        WHERE edm.estimate_id = er.id
      ) AS "isDesignated"
    FROM estimate_requests er
    WHERE er.id = ${estimateRequestId}
    FOR UPDATE
  `;

  return rows[0] ?? null;
};

/**
 * 마감 인원 카운트용 활성 견적(PENDING/CONFIRMED) 개수 조회
 * 반려(REJECTED) 및 soft-delete 건은 제외
 */
export const countActiveProposals = async (
  tx: QuoteTransactionClient,
  estimateRequestId: number
): Promise<number> => {
  return tx.quote.count({
    where: {
      estimateRequestId,
      deletedAt: null,
      status: { in: [QuoteStatus.PENDING, QuoteStatus.CONFIRMED] },
    },
  });
};

/**
 * 해당 기사님의 기존 견적(미삭제) 조회
 */
export const findExistingQuote = async (
  tx: QuoteTransactionClient,
  estimateRequestId: number,
  moverId: string
): Promise<Pick<Quote, 'id' | 'status'> | null> => {
  return tx.quote.findFirst({
    where: {
      estimateRequestId,
      moverId,
      deletedAt: null,
    },
    select: {
      id: true,
      status: true,
    },
  });
};

/**
 * 지정 견적 대상 무버 여부 확인
 */
export const isDesignatedMover = async (
  tx: QuoteTransactionClient,
  estimateRequestId: number,
  moverId: string
): Promise<boolean> => {
  const designated = await tx.estimateDesignatedMover.findFirst({
    where: {
      estimateId: estimateRequestId,
      moverId,
    },
    select: { id: true },
  });

  return designated !== null;
};

/**
 * 견적(PROPOSAL/REJECTION) 생성
 */
export const createQuote = async (
  tx: QuoteTransactionClient,
  data: CreateQuoteData
): Promise<Quote> => {
  return tx.quote.create({
    data: {
      estimateRequestId: data.estimateRequestId,
      moverId: data.moverId,
      status: data.status,
      isDesignated: data.isDesignated,
      price: data.price,
      comment: data.comment,
      rejectReason: data.rejectReason,
    },
  });
};

/**
 * 비관적 락 트랜잭션 실행 래퍼
 */
export const runInTransaction = async <T>(
  handler: (tx: QuoteTransactionClient) => Promise<T>
): Promise<T> => {
  return prisma.$transaction(async (tx) => handler(tx));
};
