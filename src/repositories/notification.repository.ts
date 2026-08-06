import type {
  MoveType,
  NotificationOutbox,
  NotificationOutboxJobType,
  NotificationType,
  Prisma,
  QuoteStatus,
  Region,
} from '@prisma/client';
import {
  EstimateRequestStatus,
  Region as RegionEnum,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getRegionAddressKeywords } from '../utils/region.util';

type DbClient = Prisma.TransactionClient | typeof prisma;

export interface CreateOutboxJobData {
  jobType: NotificationOutboxJobType;
  sourceId: string;
  snapshotAt?: Date | null;
}

export interface FanoutEstimateRequestRow {
  id: number;
  userId: string;
  status: EstimateRequestStatus;
  moveType: MoveType | null;
  departureAddress: string | null;
  arrivalAddress: string | null;
}

export interface CreateFanoutNotificationRow {
  receiverId: string;
  type: NotificationType;
  content: string;
  payload: Prisma.InputJsonValue;
  estimateRequestId?: number | null;
  sourceId: string;
}

/** createMany 청크 크기 — 워커 createMany / SSE 부하 균형용 (200) */
export const NOTIFICATION_OUTBOX_CHUNK_SIZE = 200;
/** claim 재시도 상한 — 초과 시 FAILED */
export const NOTIFICATION_OUTBOX_MAX_ATTEMPTS = 5;

const LIST_LIMIT = 10;

const notificationSelect = {
  id: true,
  type: true,
  content: true,
  payload: true,
  isRead: true,
  createdAt: true,
  quoteId: true,
  estimateRequestId: true,
  commentId: true,
  reviewId: true,
  userReportId: true,
} satisfies Prisma.NotificationSelect;

export type NotificationRow = Prisma.NotificationGetPayload<{
  select: typeof notificationSelect;
}>;

export interface CreateNotificationData {
  receiverId: string;
  type: NotificationType;
  content: string;
  payload: Prisma.InputJsonValue;
  quoteId?: number | null;
  estimateRequestId?: number | null;
  commentId?: number | null;
  reviewId?: number | null;
  userReportId?: number | null;
}

/** 알림 1건 생성 */
export const create = async (
  data: CreateNotificationData,
  db?: DbClient
): Promise<NotificationRow> => {
  const client = db ?? prisma;

  return client.notification.create({
    data: {
      receiverId: data.receiverId,
      type: data.type,
      content: data.content,
      payload: data.payload,
      quoteId: data.quoteId ?? undefined,
      estimateRequestId: data.estimateRequestId ?? undefined,
      commentId: data.commentId ?? undefined,
      reviewId: data.reviewId ?? undefined,
      userReportId: data.userReportId ?? undefined,
    },
    select: notificationSelect,
  });
};

/**
 * 대량 fan-out Outbox 1건 enqueue.
 * (jobType, sourceId) 유니크 — 이미 있으면 skipDuplicates로 무시(멱등).
 */
export const createOutboxJob = async (
  data: CreateOutboxJobData,
  db: DbClient = prisma
): Promise<void> => {
  await db.notificationOutbox.createMany({
    data: [
      {
        jobType: data.jobType,
        sourceId: data.sourceId,
        snapshotAt: data.snapshotAt ?? undefined,
        status: 'PENDING',
      },
    ],
    skipDuplicates: true,
  });
};

/**
 * PENDING(또는 stale PROCESSING) 잡 1건 claim — FOR UPDATE SKIP LOCKED.
 * - 일반 claim / 실패 재시도 / stale PROCESSING 회수: attempts++
 * - yield 재개(PENDING + cursor 있음 + lastError null): attempts 유지 (정상 진행 양보)
 * 상한 도달 시 FAILED. status=FAILED 행은 호출측에서 처리 스킵.
 * Sprint 2: 매칭 fan-out만 claim. ADMIN_NOTICE는 후속 전략 추가 시 조건 확장.
 */
export const claimOutboxJob = async (
  maxAttempts: number = NOTIFICATION_OUTBOX_MAX_ATTEMPTS,
  staleBefore: Date = new Date(Date.now() - 5 * 60 * 1000)
): Promise<NotificationOutbox | null> => {
  const rows = await prisma.$queryRaw<NotificationOutbox[]>`
    WITH cte AS (
      SELECT
        id,
        CASE
          WHEN status = 'PENDING'::"NotificationOutboxStatus"
            AND cursor_user_id IS NOT NULL
            AND last_error IS NULL
          THEN attempts
          ELSE attempts + 1
        END AS next_attempts
      FROM notification_outboxes
      WHERE attempts < ${maxAttempts}
        AND job_type = 'NEW_QUOTE_REQUEST_FANOUT'::"NotificationOutboxJobType"
        AND (
          status = 'PENDING'::"NotificationOutboxStatus"
          OR (
            status = 'PROCESSING'::"NotificationOutboxStatus"
            AND updated_at < ${staleBefore}
          )
        )
      ORDER BY updated_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE notification_outboxes AS o
    SET
      attempts = cte.next_attempts,
      status = CASE
        WHEN cte.next_attempts >= ${maxAttempts}
          THEN 'FAILED'::"NotificationOutboxStatus"
        ELSE 'PROCESSING'::"NotificationOutboxStatus"
      END,
      last_error = CASE
        WHEN cte.next_attempts >= ${maxAttempts}
          THEN 'max attempts exceeded on claim'
        ELSE o.last_error
      END,
      updated_at = NOW()
    FROM cte
    WHERE o.id = cte.id
    RETURNING
      o.id,
      o.job_type AS "jobType",
      o.source_id AS "sourceId",
      o.status,
      o.cursor_user_id AS "cursorUserId",
      o.attempts,
      o.last_error AS "lastError",
      o.snapshot_at AS "snapshotAt",
      o.created_at AS "createdAt",
      o.updated_at AS "updatedAt"
  `;

  return rows[0] ?? null;
};

/** 청크 진행 — 커서만 갱신하고 PROCESSING 유지 (같은 claim 안) */
export const updateOutboxCursor = async (
  id: number,
  cursorUserId: string
): Promise<void> => {
  await prisma.notificationOutbox.update({
    where: { id },
    data: {
      cursorUserId,
      status: 'PROCESSING',
      lastError: null,
    },
  });
};

/**
 * claim당 청크 상한 양보 — cursor 유지 후 PENDING 복귀.
 * lastError=null + cursor 있음 → 다음 claim에서 attempts 미증가(yield 재개).
 */
export const markOutboxYield = async (
  id: number,
  cursorUserId: string
): Promise<void> => {
  await prisma.notificationOutbox.update({
    where: { id },
    data: {
      cursorUserId,
      status: 'PENDING',
      lastError: null,
    },
  });
};

export const markOutboxDone = async (id: number): Promise<void> => {
  await prisma.notificationOutbox.update({
    where: { id },
    data: {
      status: 'DONE',
      lastError: null,
    },
  });
};

/**
 * 실패 시 lastError 기록. attempts는 claim 시 이미 증가했으므로 여기선 상태만 전환.
 * 상한 도달이면 FAILED, 아니면 PENDING 재대기(커서는 유지되어 이어서 보낼 수 있음).
 */
export const markOutboxFailure = async (
  id: number,
  lastError: string,
  attempts: number,
  maxAttempts: number = NOTIFICATION_OUTBOX_MAX_ATTEMPTS
): Promise<void> => {
  const truncated =
    lastError.length > 1000 ? lastError.slice(0, 1000) : lastError;

  await prisma.notificationOutbox.update({
    where: { id },
    data: {
      lastError: truncated,
      status: attempts >= maxAttempts ? 'FAILED' : 'PENDING',
    },
  });
};

/** fan-out용 견적요청 요약 — status로 SUBMITTED만 발송할지 판단 */
export const findEstimateRequestForFanout = async (
  estimateRequestId: number
): Promise<FanoutEstimateRequestRow | null> => {
  return prisma.estimateRequest.findUnique({
    where: { id: estimateRequestId },
    select: {
      id: true,
      userId: true,
      status: true,
      moveType: true,
      departureAddress: true,
      arrivalAddress: true,
    },
  });
};

/**
 * 매칭 기사 userId 청크 — userId 오름차순 커서 페이징.
 * (기존 전체 조회 findMoverIdsForNewRequest 와 동일 매칭 조건)
 */
export const findMoverIdsForNewRequestChunk = async (params: {
  departureAddress: string | null;
  arrivalAddress: string | null;
  moveType: MoveType | null;
  cursorUserId?: string | null;
  take: number;
}): Promise<string[]> => {
  if (!params.moveType) {
    return [];
  }

  const addressMatchesRegion = (
    address: string | null | undefined,
    region: Region
  ): boolean => {
    if (!address) {
      return false;
    }

    return getRegionAddressKeywords(region).some((keyword) =>
      address.startsWith(keyword)
    );
  };

  const matchingRegions = Object.values(RegionEnum).filter(
    (region) =>
      addressMatchesRegion(params.departureAddress, region) ||
      addressMatchesRegion(params.arrivalAddress, region)
  );

  if (matchingRegions.length === 0) {
    return [];
  }

  const profiles = await prisma.moverProfile.findMany({
    where: {
      service: { has: params.moveType },
      serviceRegions: { some: { region: { in: matchingRegions } } },
      user: { deletedAt: null, userType: 'MOVER' },
      ...(params.cursorUserId
        ? { userId: { gt: params.cursorUserId } }
        : {}),
    },
    select: { userId: true },
    orderBy: { userId: 'asc' },
    take: params.take,
  });

  return profiles.map((profile) => profile.userId);
};

/**
 * 대량 알림 insert — Unique(receiverId, type, sourceId) + skipDuplicates 멱등.
 * 실제 삽입 건수를 반환한다.
 */
export const createManyFanoutNotifications = async (
  rows: CreateFanoutNotificationRow[]
): Promise<number> => {
  if (rows.length === 0) {
    return 0;
  }

  const result = await prisma.notification.createMany({
    data: rows.map((row) => ({
      receiverId: row.receiverId,
      type: row.type,
      content: row.content,
      payload: row.payload,
      estimateRequestId: row.estimateRequestId ?? undefined,
      sourceId: row.sourceId,
    })),
    skipDuplicates: true,
  });

  return result.count;
};

/** 수신자 최신 알림 최대 10개 + 전체 건수 */
export const findLatestByReceiver = async (
  receiverId: string,
  db: DbClient = prisma
): Promise<{ notifications: NotificationRow[]; totalCount: number }> => {
  const [notifications, totalCount] = await Promise.all([
    db.notification.findMany({
      where: { receiverId },
      // createdAt이 같으면 id로 안정 정렬 (목록 순서가 흔들리지 않게)
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: LIST_LIMIT,
      select: notificationSelect,
    }),
    db.notification.count({ where: { receiverId } }),
  ]);

  return { notifications, totalCount };
};

/** 미읽음 건수 */
export const countUnreadByReceiver = async (
  receiverId: string,
  db: DbClient = prisma
): Promise<number> => {
  return db.notification.count({
    where: { receiverId, isRead: false },
  });
};

/** 본인 알림 단건 조회 */
export const findByIdAndReceiver = async (
  id: number,
  receiverId: string,
  db: DbClient = prisma
): Promise<NotificationRow | null> => {
  return db.notification.findFirst({
    where: { id, receiverId },
    select: notificationSelect,
  });
};

/** 단건 읽음 처리 */
export const markAsRead = async (
  id: number,
  receiverId: string,
  db: DbClient = prisma
): Promise<NotificationRow | null> => {
  const { count } = await db.notification.updateMany({
    where: { id, receiverId },
    data: { isRead: true },
  });

  if (count === 0) {
    return null;
  }

  return findByIdAndReceiver(id, receiverId, db);
};

/**
 * 리마인더 중복 방지 — (receiverId, type, estimateRequestId) 존재 여부
 */
export const existsByReceiverTypeAndEstimate = async (
  receiverId: string,
  type: NotificationType,
  estimateRequestId: number,
  db: DbClient = prisma
): Promise<boolean> => {
  const found = await db.notification.findFirst({
    where: { receiverId, type, estimateRequestId },
    select: { id: true },
  });

  return found !== null;
};

/** 견적요청의 지정 기사 moverId 목록 */
export const findDesignatedMoverIds = async (
  estimateRequestId: number,
  db: DbClient = prisma
): Promise<string[]> => {
  const rows = await db.estimateDesignatedMover.findMany({
    where: { estimateId: estimateRequestId },
    select: { moverId: true },
  });

  return rows.map((row) => row.moverId);
};

/** 유저 이름(이사·견적 알림 payload용) */
export const findUserNameById = async (
  userId: string,
  db: DbClient = prisma
): Promise<string | null> => {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { name: true },
  });

  return user?.name ?? null;
};

/**
 * COMPLETED 인데 REVIEW_REQUESTED 가 아직 없는 견적요청.
 * 자정 cron·부팅 catch-up 에서 미발송분만 보낸다.
 * take 로 1회 배치 상한 — 남은 건은 다음 실행에서 id 오름차순으로 이어서 처리.
 */
export const findCompletedRequestsMissingReviewRequested = async (
  take: number,
  db: DbClient = prisma
): Promise<
  Array<{ id: number; userId: string; moveType: MoveType | null }>
> => {
  return db.estimateRequest.findMany({
    where: {
      status: EstimateRequestStatus.COMPLETED,
      notifications: {
        none: { type: 'REVIEW_REQUESTED' },
      },
    },
    orderBy: { id: 'asc' },
    take,
    select: {
      id: true,
      userId: true,
      moveType: true,
    },
  });
};

/** 리뷰 작성 알림용 — reviewId로 기사·고객 닉네임·견적요청 조회 */
export const findReviewWrittenNotificationContext = async (
  reviewId: number,
  db: DbClient = prisma
): Promise<{
  reviewId: number;
  moverId: string;
  customerNickname: string | null;
  estimateRequestId: number;
} | null> => {
  const review = await db.review.findFirst({
    where: { id: reviewId, deletedAt: null },
    select: {
      id: true,
      user: { select: { nickname: true } },
      quote: {
        select: {
          moverId: true,
          estimateRequestId: true,
        },
      },
    },
  });

  if (!review?.quote.moverId) {
    return null;
  }

  return {
    reviewId: review.id,
    moverId: review.quote.moverId,
    customerNickname: review.user.nickname,
    estimateRequestId: review.quote.estimateRequestId,
  };
};

/** 댓글 알림용 — commentId로 작성자·원글/부모 수신자 조회 */
export const findCommunityCommentNotificationContext = async (
  commentId: number,
  db: DbClient = prisma
): Promise<{
  commentId: number;
  postId: number;
  authorId: string;
  authorNickname: string | null;
  postAuthorId: string;
  parentCommentAuthorId: string | null;
  isReply: boolean;
} | null> => {
  const comment = await db.comment.findFirst({
    where: { id: commentId, deletedAt: null },
    select: {
      id: true,
      postId: true,
      userId: true,
      parentId: true,
      user: { select: { nickname: true } },
      post: { select: { userId: true } },
      parent: { select: { userId: true } },
    },
  });

  if (!comment) {
    return null;
  }

  return {
    commentId: comment.id,
    postId: comment.postId,
    authorId: comment.userId,
    authorNickname: comment.user.nickname,
    postAuthorId: comment.post.userId,
    parentCommentAuthorId: comment.parent?.userId ?? null,
    isReply: comment.parentId !== null,
  };
};

/**
 * 신고로 삭제된 게시글 알림용.
 * ARTICLE(Post) 신고 + 게시글 작성자. 삭제 mutation 연동 시 사용.
 */
export const findPostRemovedByReportNotificationContext = async (
  userReportId: number,
  db: DbClient = prisma
): Promise<{
  userReportId: number;
  postAuthorId: string;
} | null> => {
  const report = await db.userReport.findFirst({
    where: {
      id: userReportId,
      target: 'ARTICLE',
    },
    select: {
      id: true,
      targetId: true,
    },
  });

  if (!report) {
    return null;
  }

  const postId = Number(report.targetId);
  if (!Number.isInteger(postId) || postId <= 0) {
    return null;
  }

  const post = await db.post.findFirst({
    where: { id: postId },
    select: { userId: true },
  });

  if (!post) {
    return null;
  }

  return {
    userReportId: report.id,
    postAuthorId: post.userId,
  };
};

/** 견적 알림용 컨텍스트 — quoteId만으로 고객·기사·이사유형·지정여부 조회 */
export interface QuoteNotificationContext {
  quoteId: number;
  estimateRequestId: number;
  customerId: string;
  moverId: string | null;
  moverName: string | null;
  moveType: MoveType | null;
  isDesignated: boolean;
  status: QuoteStatus;
}

export const findQuoteNotificationContext = async (
  quoteId: number,
  db: DbClient = prisma
): Promise<QuoteNotificationContext | null> => {
  const quote = await db.quote.findFirst({
    where: { id: quoteId, deletedAt: null },
    select: {
      id: true,
      estimateRequestId: true,
      moverId: true,
      isDesignated: true,
      status: true,
      estimateRequest: {
        select: {
          userId: true,
          moveType: true,
        },
      },
      mover: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!quote) {
    return null;
  }

  return {
    quoteId: quote.id,
    estimateRequestId: quote.estimateRequestId,
    customerId: quote.estimateRequest.userId,
    moverId: quote.moverId,
    moverName: quote.mover?.name ?? null,
    moveType: quote.estimateRequest.moveType,
    isDesignated: quote.isDesignated,
    status: quote.status,
  };
};

/**
 * 이사 전날 리마인더 대상:
 * CONFIRMED + moveDate = 내일(UTC Date) 인 요청과 확정 견적 기사
 */
export const findConfirmedMovesOnDate = async (
  moveDate: Date,
  db: DbClient = prisma
) => {
  return db.estimateRequest.findMany({
    where: {
      status: 'CONFIRMED',
      moveDate,
    },
    select: {
      id: true,
      userId: true,
      departureAddress: true,
      arrivalAddress: true,
      confirmedQuote: {
        select: {
          id: true,
          moverId: true,
        },
      },
    },
  });
};
