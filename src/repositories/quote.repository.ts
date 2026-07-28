import {
  Prisma,
  QuoteStatus,
  type EstimateRequestStatus,
  type MoveType,
  type Quote,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import type { QuoteListStatus } from '../schemas/quote.schema';

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

/** 견적 상세 조회 결과 */
export interface QuoteDetailRow {
  id: number;
  estimateRequestId: number;
  moverId: string | null;
  price: number | null;
  status: QuoteStatus;
  isDesignated: boolean;
  estimateRequest: {
    moveType: MoveType | null;
    moveDate: Date | null;
    departureAddress: string | null;
    arrivalAddress: string | null;
    submittedAt: Date | null;
    createdAt: Date;
    status: EstimateRequestStatus;
    user: { name: string };
  };
}

/** 반려 견적 목록 행 */
export interface RejectedQuoteListRow {
  id: number;
  estimateRequestId: number;
  isDesignated: boolean;
  createdAt: Date;
  estimateRequest: {
    moveType: MoveType | null;
    moveDate: Date | null;
    departureAddress: string | null;
    arrivalAddress: string | null;
    user: { name: string };
  };
}

/** 보낸 견적 목록 행 */
export interface SentQuoteListRow {
  id: number;
  estimateRequestId: number;
  price: number | null;
  status: QuoteStatus;
  isDesignated: boolean;
  createdAt: Date;
  estimateRequest: {
    moveType: MoveType | null;
    moveDate: Date | null;
    departureAddress: string | null;
    arrivalAddress: string | null;
    status: EstimateRequestStatus;
    user: { name: string };
  };
}

export type QuoteListRow = RejectedQuoteListRow | SentQuoteListRow;

/** 견적 목록 조회 파라미터 */
export interface FindQuotesByMoverParams {
  moverId: string;
  listStatus: QuoteListStatus;
  skip: number;
  take: number;
}

/** status=SENT 조회 대상 견적 상태 */
const SENT_QUOTE_STATUSES: QuoteStatus[] = [
  QuoteStatus.PENDING,
  QuoteStatus.CONFIRMED,
];

/**
 * listStatus 기준 조회 대상 QuoteStatus 배열 반환
 */
const resolveListStatuses = (listStatus: QuoteListStatus): QuoteStatus[] => {
  if (listStatus === 'REJECTED') {
    return [QuoteStatus.REJECTED];
  }

  return SENT_QUOTE_STATUSES;
};

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

/** 견적 상세 조회용 select */
const quoteDetailSelect = {
  id: true,
  estimateRequestId: true,
  moverId: true,
  price: true,
  status: true,
  isDesignated: true,
  deletedAt: true,
  estimateRequest: {
    select: {
      moveType: true,
      moveDate: true,
      departureAddress: true,
      arrivalAddress: true,
      submittedAt: true,
      createdAt: true,
      status: true,
      user: { select: { name: true } },
    },
  },
} satisfies Prisma.QuoteSelect;

/** 반려 견적 목록용 select */
const rejectedQuoteListSelect = {
  id: true,
  estimateRequestId: true,
  isDesignated: true,
  createdAt: true,
  estimateRequest: {
    select: {
      moveType: true,
      moveDate: true,
      departureAddress: true,
      arrivalAddress: true,
      user: { select: { name: true } },
    },
  },
} satisfies Prisma.QuoteSelect;

/** 보낸 견적 목록용 select */
const sentQuoteListSelect = {
  id: true,
  estimateRequestId: true,
  price: true,
  status: true,
  isDesignated: true,
  createdAt: true,
  estimateRequest: {
    select: {
      moveType: true,
      moveDate: true,
      departureAddress: true,
      arrivalAddress: true,
      status: true,
      user: { select: { name: true } },
    },
  },
} satisfies Prisma.QuoteSelect;

/**
 * 견적 ID로 상세 조회
 */
export const findQuoteById = async (
  quoteId: number
): Promise<QuoteDetailRow | null> => {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    select: quoteDetailSelect,
  });

  // soft-delete 된 견적은 미존재로 처리
  if (!quote || quote.deletedAt !== null) {
    return null;
  }

  const { deletedAt: _deletedAt, ...detail } = quote;
  return detail;
};

/**
 * 기사님 견적 목록 및 총 개수를 동일 트랜잭션에서 조회
 * listStatus 기준 최소 필드만 select
 */
export function findQuotesByMoverWithCount(
  params: FindQuotesByMoverParams & { listStatus: 'REJECTED' }
): Promise<{ items: RejectedQuoteListRow[]; totalCount: number }>;
export function findQuotesByMoverWithCount(
  params: FindQuotesByMoverParams & { listStatus: 'SENT' }
): Promise<{ items: SentQuoteListRow[]; totalCount: number }>;
export async function findQuotesByMoverWithCount(
  params: FindQuotesByMoverParams
): Promise<{ items: QuoteListRow[]; totalCount: number }> {
  const where: Prisma.QuoteWhereInput = {
    moverId: params.moverId,
    deletedAt: null,
    status: { in: resolveListStatuses(params.listStatus) },
  };

  if (params.listStatus === 'REJECTED') {
    const [items, totalCount] = await prisma.$transaction([
      prisma.quote.findMany({
        where,
        select: rejectedQuoteListSelect,
        orderBy: { createdAt: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      prisma.quote.count({ where }),
    ]);

    return { items, totalCount };
  }

  const [items, totalCount] = await prisma.$transaction([
    prisma.quote.findMany({
      where,
      select: sentQuoteListSelect,
      orderBy: { createdAt: 'desc' },
      skip: params.skip,
      take: params.take,
    }),
    prisma.quote.count({ where }),
  ]);

  return { items, totalCount };
}
