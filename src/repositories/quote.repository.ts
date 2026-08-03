import {
  EstimateRequestStatus,
  Prisma,
  QuoteStatus,
  type MoveType,
  type Quote,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  SENT_QUOTE_STATUSES,
  type QuoteListStatus,
} from '../schemas/quote.schema';
import { startOfDayKst } from '../utils/date.util';

// --- [기사님(MOVER)용 API] ---

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
  rejectReason: string | null;
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
      status: { in: SENT_QUOTE_STATUSES },
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
  rejectReason: true,
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

  // listStatus 기준 select 분기
  const select =
    params.listStatus === 'REJECTED'
      ? rejectedQuoteListSelect
      : sentQuoteListSelect;

  const [items, totalCount] = await prisma.$transaction([
    prisma.quote.findMany({
      where,
      select,
      orderBy: { createdAt: 'desc' },
      skip: params.skip,
      take: params.take,
    }),
    prisma.quote.count({ where }),
  ]);

  return { items, totalCount };
}

// --- [일반 유저(CUSTOMER)용 API] ---

/** 고객 견적에 포함되는 기사님 기본 정보 */
export interface CustomerQuoteMoverRow {
  id: string;
  nickname: string;
  profileImageKey: string | null;
  career: number | null;
  confirmedQuoteCount: number;
  favoriteCount: number;
  isFavorited: boolean;
  ratingSum: number;
  reviewCount: number;
}

/** 고객 견적 목록용 견적 행 */
export interface CustomerQuoteRow {
  id: number;
  price: number | null;
  status: QuoteStatus;
  isDesignated: boolean;
  moverId: string | null;
}

/** 대기 중 견적 요청 + 견적 목록 */
export interface CustomerPendingEstimateRequestRow {
  id: number;
  status: EstimateRequestStatus;
  moveType: MoveType | null;
  moveDate: Date | null;
  departureAddress: string | null;
  arrivalAddress: string | null;
  quotes: CustomerQuoteRow[];
}

/** 과거 견적 요청 그룹 행 */
export interface CustomerPastEstimateRequestRow {
  id: number;
  submittedAt: Date | null;
  moveType: MoveType | null;
  moveDate: Date | null;
  departureAddress: string | null;
  arrivalAddress: string | null;
  quotes: CustomerQuoteRow[];
}

/** 고객 견적 상세 행 */
export interface CustomerQuoteDetailRow {
  id: number;
  estimateRequestId: number;
  price: number | null;
  comment: string | null;
  status: QuoteStatus;
  isDesignated: boolean;
  moverId: string | null;
  estimateRequest: {
    moveType: MoveType | null;
    moveDate: Date | null;
    departureAddress: string | null;
    arrivalAddress: string | null;
  };
}

/** 과거 견적 목록 조회 파라미터 */
export interface FindCustomerPastEstimateRequestsParams {
  customerId: string;
  cursor?: number;
  limit: number;
  estimateRequestId?: number;
  estimateRequestStatuses: EstimateRequestStatus[];
  quoteStatuses: QuoteStatus[];
}

/** 고객 견적 목록용 quote select (목록에는 comment 미포함) */
const customerQuoteListSelect = {
  id: true,
  price: true,
  status: true,
  isDesignated: true,
  moverId: true,
} satisfies Prisma.QuoteSelect;

/**
 * 기사님별 리뷰 합계·건수를 DB에서 집계
 */
const aggregateReviewStatsByMoverIds = async (
  moverIds: string[]
): Promise<Map<string, { sum: number; count: number }>> => {
  const rows = await prisma.$queryRaw<
    Array<{ moverId: string; ratingSum: number; reviewCount: number }>
  >`
    SELECT
      q.mover_id AS "moverId",
      COALESCE(SUM(r.rating), 0)::float AS "ratingSum",
      COUNT(r.id)::int AS "reviewCount"
    FROM reviews r
    INNER JOIN quotes q ON q.id = r.quote_id
    WHERE q.mover_id IN (${Prisma.join(moverIds)})
      AND r.deleted_at IS NULL
      AND q.deleted_at IS NULL
    GROUP BY q.mover_id
  `;

  return new Map(
    rows.map((row) => [
      row.moverId,
      { sum: Number(row.ratingSum), count: Number(row.reviewCount) },
    ])
  );
};

/**
 * 기사님 카드용 통계를 moverId 목록 기준 일괄 조회
 */
export const findMoverCardsByIds = async (
  moverIds: string[],
  customerId: string
): Promise<Map<string, CustomerQuoteMoverRow>> => {
  const uniqueMoverIds = [...new Set(moverIds.filter(Boolean))];
  const result = new Map<string, CustomerQuoteMoverRow>();

  if (uniqueMoverIds.length === 0) {
    return result;
  }

  // 프로필·찜 통계와 리뷰 집계를 병렬 조회
  const [movers, reviewAgg] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: uniqueMoverIds } },
      select: {
        id: true,
        nickname: true,
        profileImageKey: true,
        moverProfile: { select: { career: true } },
        favoritesAsMover: {
          where: { userId: customerId },
          select: { id: true },
          take: 1,
        },
        _count: {
          select: {
            favoritesAsMover: true,
            quotesAsMover: {
              where: { status: QuoteStatus.CONFIRMED, deletedAt: null },
            },
          },
        },
      },
    }),
    aggregateReviewStatsByMoverIds(uniqueMoverIds),
  ]);

  for (const mover of movers) {
    const agg = reviewAgg.get(mover.id) ?? { sum: 0, count: 0 };

    result.set(mover.id, {
      id: mover.id,
      nickname: mover.nickname,
      profileImageKey: mover.profileImageKey,
      career: mover.moverProfile?.career ?? null,
      confirmedQuoteCount: mover._count.quotesAsMover,
      favoriteCount: mover._count.favoritesAsMover,
      isFavorited: mover.favoritesAsMover.length > 0,
      ratingSum: agg.sum,
      reviewCount: agg.count,
    });
  }

  return result;
};

/**
 * 고객의 대기 중(SUBMITTED) 견적 요청과 PENDING 견적 목록 조회
 */
export const findPendingEstimateRequestWithQuotes = async (
  customerId: string
): Promise<CustomerPendingEstimateRequestRow | null> => {
  return prisma.estimateRequest.findFirst({
    where: {
      userId: customerId,
      status: EstimateRequestStatus.SUBMITTED,
    },
    orderBy: [{ submittedAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
    select: {
      id: true,
      status: true,
      moveType: true,
      moveDate: true,
      departureAddress: true,
      arrivalAddress: true,
      quotes: {
        where: {
          deletedAt: null,
          status: QuoteStatus.PENDING,
        },
        select: customerQuoteListSelect,
        orderBy: { createdAt: 'desc' },
      },
    },
  });
};

/**
 * 고객의 과거 견적 요청 목록 조회
 * estimateRequestId 존재 시 해당 요청만 단건 필터링
 */
export const findCustomerPastEstimateRequests = async (
  params: FindCustomerPastEstimateRequestsParams
): Promise<{
  items: CustomerPastEstimateRequestRow[];
  hasNextPage: boolean;
}> => {
  // 특정 견적 요청 블록 내 필터 드롭다운 변경 시 단건만 조회
  if (params.estimateRequestId != null) {
    const item = await prisma.estimateRequest.findFirst({
      where: {
        id: params.estimateRequestId,
        userId: params.customerId,
        status: {
          in: params.estimateRequestStatuses,
        },
      },
      select: {
        id: true,
        submittedAt: true,
        moveType: true,
        moveDate: true,
        departureAddress: true,
        arrivalAddress: true,
        quotes: {
          where: {
            deletedAt: null,
            status: { in: params.quoteStatuses },
          },
          select: customerQuoteListSelect,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    return {
      items: item ? [item] : [],
      hasNextPage: false,
    };
  }

  // 커서 기반 페이지네이션 적용 (최근 견적 요청순)
  const rows = await prisma.estimateRequest.findMany({
    where: {
      userId: params.customerId,
      status: {
        in: params.estimateRequestStatuses,
      },
      quotes: {
        some: {
          deletedAt: null,
          status: { in: params.quoteStatuses },
        },
      },
    },
    orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
    ...(params.cursor != null
      ? { cursor: { id: params.cursor }, skip: 1 }
      : {}),
    take: params.limit + 1,
    select: {
      id: true,
      submittedAt: true,
      moveType: true,
      moveDate: true,
      departureAddress: true,
      arrivalAddress: true,
      quotes: {
        where: {
          deletedAt: null,
          status: { in: params.quoteStatuses },
        },
        select: customerQuoteListSelect,
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  const hasNextPage = rows.length > params.limit;
  const items = hasNextPage ? rows.slice(0, params.limit) : rows;

  return { items, hasNextPage };
};

/**
 * 고객 소유 견적 상세 조회
 */
export const findCustomerQuoteById = async (
  quoteId: number,
  customerId: string
): Promise<CustomerQuoteDetailRow | null> => {
  const quote = await prisma.quote.findFirst({
    where: {
      id: quoteId,
      deletedAt: null,
      status: { in: SENT_QUOTE_STATUSES },
      estimateRequest: { userId: customerId },
    },
    select: {
      id: true,
      estimateRequestId: true,
      price: true,
      comment: true,
      status: true,
      isDesignated: true,
      moverId: true,
      estimateRequest: {
        select: {
          moveType: true,
          moveDate: true,
          departureAddress: true,
          arrivalAddress: true,
        },
      },
    },
  });

  return quote;
};

/** 확정 대상 견적 행 */
export interface CustomerQuoteForConfirmRow {
  id: number;
  estimateRequestId: number;
  status: QuoteStatus;
}

/**
 * 고객 소유 확정 대상 견적 조회 (PENDING/CONFIRMED)
 */
export const findCustomerQuoteForConfirm = async (
  tx: QuoteTransactionClient,
  quoteId: number,
  customerId: string
): Promise<CustomerQuoteForConfirmRow | null> => {
  return tx.quote.findFirst({
    where: {
      id: quoteId,
      deletedAt: null,
      status: { in: SENT_QUOTE_STATUSES },
      estimateRequest: { userId: customerId },
    },
    select: {
      id: true,
      estimateRequestId: true,
      status: true,
    },
  });
};
/*
 * 견적·이사 요청 확정 상태 업데이트
 */
export const confirmQuoteWithEstimateRequest = async (
  tx: QuoteTransactionClient,
  quoteId: number,
  estimateRequestId: number
): Promise<boolean> => {
  const { count } = await tx.quote.updateMany({
    where: {
      id: quoteId,
      estimateRequestId,
      deletedAt: null,
      status: QuoteStatus.PENDING,
    },
    data: { status: QuoteStatus.CONFIRMED },
  });

  if (count === 0) {
    return false;
  }

  await tx.estimateRequest.update({
    where: { id: estimateRequestId },
    data: {
      status: EstimateRequestStatus.CONFIRMED,
      confirmedQuoteId: quoteId,
    },
  });

  return true;
};

/* 리뷰에서 필요해서 추가한 함수들! */
/** 리뷰 작성 검증용 견적 조회 결과 */
export interface QuoteForReviewCreate {
  id: number;
  status: QuoteStatus;
  estimateRequest: {
    userId: string;
    status: EstimateRequestStatus;
    moveDate: Date | null;
    confirmedQuoteId: number | null;
  };
}

/**
 * 리뷰 작성 검증용 견적 조회 (삭제된 견적 제외)
 */
export const findQuoteForReviewCreate = async (
  quoteId: number,
  tx?: Prisma.TransactionClient
): Promise<QuoteForReviewCreate | null> => {
  const dbClient = tx ?? prisma;

  return dbClient.quote.findFirst({
    where: {
      id: quoteId,
      deletedAt: null,
    },
    select: {
      id: true,
      status: true,
      estimateRequest: {
        select: {
          userId: true,
          status: true,
          moveDate: true,
          confirmedQuoteId: true,
        },
      },
    },
  });
};

/**
 * 고객이 리뷰 작성 가능한 확정 견적 목록 (페이지네이션)
 * createReview 작성 가능 조건과 동일
 * — 활성 리뷰가 없는 견적만 (soft-delete 후 재작성 대상 포함)
 */
export const findWritableQuotesByCustomerId = async (
  customerId: string,
  params: { page: number; limit: number },
  tx?: Prisma.TransactionClient
) => {
  const dbClient = tx ?? prisma;
  const todayStart = startOfDayKst(new Date());
  const skip = (params.page - 1) * params.limit;

  const where: Prisma.QuoteWhereInput = {
    deletedAt: null,
    status: QuoteStatus.CONFIRMED,
    confirmedForRequest: { isNot: null },
    estimateRequest: {
      userId: customerId,
      OR: [
        { status: EstimateRequestStatus.COMPLETED },
        { moveDate: { lte: todayStart } },
      ],
    },
    // create와 동일: 활성 리뷰(deletedAt null)가 없을 때만 작성 가능
    // soft-delete된 리뷰만 있는 견적은 재작성 대상으로 다시 노출한다
    reviews: {
      none: { userId: customerId, deletedAt: null },
    },
  };

  const [items, totalCount] = await Promise.all([
    dbClient.quote.findMany({
      where,
      orderBy: [{ estimateRequest: { moveDate: 'desc' } }, { id: 'desc' }],
      skip,
      take: params.limit,
      select: {
        id: true,
        price: true,
        isDesignated: true,
        mover: {
          select: {
            id: true,
            name: true,
            profileImageKey: true,
          },
        },
        estimateRequest: {
          select: {
            moveType: true,
            moveDate: true,
          },
        },
      },
    }),
    dbClient.quote.count({ where }),
  ]);

  return { items, totalCount };
};

/**
 * 기사가 받은 확정 견적(CONFIRMED) 건수.
 * soft-delete 제외. 상세·목록 카드의 confirmedCount에 사용.
 */
export const countConfirmedQuotesByMoverId = async (
  moverId: string
): Promise<number> => {
  return prisma.quote.count({
    where: {
      moverId,
      status: QuoteStatus.CONFIRMED,
      deletedAt: null,
    },
  });
};
