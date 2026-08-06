import {
  EstimateRequestStatus,
  type MoveType,
  type NotificationOutboxJobType,
  type NotificationType,
  type Prisma,
} from '@prisma/client';
import {
  renderNotificationContent,
  toMoveTypeLabel,
} from '../constants/notification.templates';
import * as notificationRepository from '../repositories/notification.repository';
import type { NotificationRow } from '../repositories/notification.repository';
import { AppError } from '../utils/app.error';
import * as notificationSse from './notification-sse.service';

type DbClient = Prisma.TransactionClient;

export interface NotificationPayload {
  [key: string]: string;
}

export interface CreateNotificationInput {
  receiverId: string;
  type: NotificationType;
  payload: NotificationPayload;
  quoteId?: number | null;
  estimateRequestId?: number | null;
  commentId?: number | null;
  reviewId?: number | null;
  userReportId?: number | null;
  tx?: DbClient;
}

export interface NotificationListItem {
  id: number;
  type: NotificationType;
  content: string;
  payload: NotificationPayload;
  isRead: boolean;
  createdAt: string;
  quoteId: number | null;
  estimateRequestId: number | null;
  commentId: number | null;
  reviewId: number | null;
  userReportId: number | null;
}

export interface NotifyDesignatedQuoteRequestArrivedParams {
  estimateRequestId: number;
  customerId: string;
  moverId: string;
  moveType: MoveType | null;
}

export interface NotifyReviewRequestedParams {
  customerId: string;
  moveType: MoveType | null;
  estimateRequestId: number;
}

export interface NotifyReviewWrittenParams {
  moverId: string;
  customerNickname: string;
  reviewId: number;
  estimateRequestId?: number | null;
}

export interface NotifyCommunityCommentParams {
  receiverId: string;
  authorNickname: string;
  commentId: number;
  postId: number;
}

export interface NotifySanctionParams {
  receiverId: string;
}

export interface NotifyCommunityReplyParams {
  receiverId: string;
  authorNickname: string;
  commentId: number;
  postId: number;
}

export interface NotifyPostRemovedByReportParams {
  receiverId: string;
  userReportId?: number | null;
}

export interface NotifyChatRoomOpenedParams {
  receiverId: string;
  counterpartName: string;
  chatRoomId: number;
}

export interface NotifyChatRoomOpenedToCounterpartsParams {
  creatorId: string;
  participantIds: string[];
  chatRoomId: number;
}

const toPayloadRecord = (value: Prisma.JsonValue): NotificationPayload => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const result: NotificationPayload = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') {
      result[key] = entry;
    }
  }
  return result;
};

const toListItem = (row: NotificationRow): NotificationListItem => ({
  id: row.id,
  type: row.type,
  content: row.content,
  payload: toPayloadRecord(row.payload),
  isRead: row.isRead,
  createdAt: row.createdAt.toISOString(),
  quoteId: row.quoteId,
  estimateRequestId: row.estimateRequestId,
  commentId: row.commentId,
  reviewId: row.reviewId,
  userReportId: row.userReportId,
});

/**
 * 내부 알림 생성 — HTTP POST 없음.
 * DB insert 후 SSE로 notification + unread-count 푸시.
 */
export const createNotification = async (
  input: CreateNotificationInput
): Promise<NotificationListItem> => {
  const content = renderNotificationContent(input.type, input.payload);
  const db = input.tx;

  const created = await notificationRepository.create(
    {
      receiverId: input.receiverId,
      type: input.type,
      content,
      payload: input.payload,
      quoteId: input.quoteId,
      estimateRequestId: input.estimateRequestId,
      commentId: input.commentId,
      reviewId: input.reviewId,
      userReportId: input.userReportId,
    },
    db
  );

  const item = toListItem(created);

  // 트랜잭션 밖(커밋 후)에서만 실시간 푸시가 의미 있으므로,
  // tx가 있으면 호출측에서 커밋 후 publish하도록 스킵할 수 있게 분리하되
  // 단순 호출(tx 없음)에서는 즉시 publish.
  if (!input.tx) {
    await publishAfterCreate(input.receiverId, item);
  }

  return item;
};

/** 트랜잭션 커밋 후 SSE 푸시용 */
export const publishAfterCreate = async (
  receiverId: string,
  notification: NotificationListItem
): Promise<void> => {
  notificationSse.publishNotification(receiverId, notification);
  const unreadCount =
    await notificationRepository.countUnreadByReceiver(receiverId);
  notificationSse.publishUnreadCount(receiverId, unreadCount);
};

/** 고객/기사 드롭다운용 최신 최대 10개 + meta.totalCount */
export const getNotificationsForReceiver = async (receiverId: string) => {
  const { notifications, totalCount } =
    await notificationRepository.findLatestByReceiver(receiverId);

  // totalCount는 부가 정보이므로 data가 아닌 meta로 둔다 (팀 API 규칙)
  return {
    items: notifications.map(toListItem),
    meta: { totalCount },
  };
};

/** 본인 알림 단건 읽음 + unread-count SSE */
export const markNotificationAsRead = async (
  notificationId: number,
  receiverId: string
) => {
  const updated = await notificationRepository.markAsRead(
    notificationId,
    receiverId
  );

  if (!updated) {
    throw new AppError('NOTIFICATION_NOT_FOUND');
  }

  const unreadCount =
    await notificationRepository.countUnreadByReceiver(receiverId);
  notificationSse.publishUnreadCount(receiverId, unreadCount);

  return toListItem(updated);
};

export interface EnqueueBulkNotificationInput {
  jobType: NotificationOutboxJobType;
  sourceId: string;
  snapshotAt?: Date | null;
}

/**
 * 공용 대량 알림 Outbox enqueue — 본 거래와 분리된 PENDING 1건만 남긴다.
 * 실제 fan-out은 Sprint 2 워커가 claim 후 createMany로 처리한다.
 */
export const enqueueBulkNotification = async (
  input: EnqueueBulkNotificationInput
): Promise<void> => {
  await notificationRepository.createOutboxJob({
    jobType: input.jobType,
    sourceId: input.sourceId,
    snapshotAt: input.snapshotAt,
  });
};

/**
 * 일반 견적 요청 제출 → 매칭 기사 fan-out 잡 enqueue.
 * 지정 알림은 여기 포함하지 않는다(지정 API 시점 단건 유지).
 * 실제 발송은 워커가 createMany 청크로 처리한다.
 */
export const enqueueNewQuoteRequestFanout = async (
  estimateRequestId: number
): Promise<void> => {
  await enqueueBulkNotification({
    jobType: 'NEW_QUOTE_REQUEST_FANOUT',
    sourceId: String(estimateRequestId),
  });
};

const OUTBOX_MAX_CLAIMS_PER_TICK = 20;
/** claim당 createMany 청크 상한 — 5×200 ≈ 1,000명 후 틱 양보 */
const OUTBOX_MAX_CHUNKS_PER_CLAIM = 5;

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

/**
 * NEW_QUOTE_REQUEST_FANOUT — 매칭 기사를 커서 청크로 createMany.
 * claim당 청크 상한에 걸리면 PENDING 양보 → 다음 cron이 이어서 처리.
 * 지정 알림은 포함하지 않는다.
 */
const processNewQuoteRequestFanout = async (job: {
  id: number;
  sourceId: string;
  cursorUserId: string | null;
}): Promise<void> => {
  const estimateRequestId = Number(job.sourceId);
  if (!Number.isInteger(estimateRequestId) || estimateRequestId <= 0) {
    throw new Error(`invalid estimateRequestId sourceId=${job.sourceId}`);
  }

  const request =
    await notificationRepository.findEstimateRequestForFanout(
      estimateRequestId
    );
  if (!request) {
    // 원본 삭제 등으로 대상 없음 — 재시도 의미 없으므로 DONE
    await notificationRepository.markOutboxDone(job.id);
    return;
  }

  // 제출 직후 취소·만료 등이면 매칭 알림 불필요 — DONE으로 종료
  if (request.status !== EstimateRequestStatus.SUBMITTED) {
    await notificationRepository.markOutboxDone(job.id);
    return;
  }

  const customerName =
    (await notificationRepository.findUserNameById(request.userId)) ?? '고객';
  const moveTypeLabel = toMoveTypeLabel(request.moveType);
  const payload = { customerName, moveTypeLabel };
  const content = renderNotificationContent(
    'NEW_QUOTE_REQUEST_ARRIVED',
    payload
  );
  const sourceId = String(request.id);
  const chunkSize = notificationRepository.NOTIFICATION_OUTBOX_CHUNK_SIZE;

  let cursorUserId = job.cursorUserId;
  let chunksProcessed = 0;

  while (true) {
    const moverIds =
      await notificationRepository.findMoverIdsForNewRequestChunk({
        departureAddress: request.departureAddress,
        arrivalAddress: request.arrivalAddress,
        moveType: request.moveType,
        cursorUserId,
        take: chunkSize,
      });

    if (moverIds.length === 0) {
      await notificationRepository.markOutboxDone(job.id);
      return;
    }

    const inserted =
      await notificationRepository.createManyFanoutNotifications(
        moverIds.map((receiverId) => ({
          receiverId,
          type: 'NEW_QUOTE_REQUEST_ARRIVED' as const,
          content,
          payload,
          estimateRequestId: request.id,
          sourceId,
        }))
      );

    // 신규 삽입이 있을 때만 refresh — FE는 후속 핸들러로 목록 재조회
    if (inserted > 0) {
      for (const receiverId of moverIds) {
        notificationSse.publishNotificationRefresh(receiverId);
      }
    }

    chunksProcessed += 1;

    if (moverIds.length < chunkSize) {
      await notificationRepository.markOutboxDone(job.id);
      return;
    }

    // length 검사 후에도 타입상 undefined 가능 — ! 대신 명시 검증
    const nextCursor = moverIds[moverIds.length - 1];
    if (!nextCursor) {
      await notificationRepository.markOutboxDone(job.id);
      return;
    }

    // 청크 상한 — PENDING 양보(cursor 유지). 다음 틱 claim은 attempts 미증가
    if (chunksProcessed >= OUTBOX_MAX_CHUNKS_PER_CLAIM) {
      await notificationRepository.markOutboxYield(job.id, nextCursor);
      return;
    }

    await notificationRepository.updateOutboxCursor(job.id, nextCursor);
    cursorUserId = nextCursor;
  }
};

/** jobType별 전략 — 신규 소비자는 여기 switch만 확장 */
const processClaimedOutboxJob = async (job: {
  id: number;
  jobType: NotificationOutboxJobType;
  sourceId: string;
  cursorUserId: string | null;
  attempts: number;
}): Promise<void> => {
  try {
    switch (job.jobType) {
      case 'NEW_QUOTE_REQUEST_FANOUT':
        await processNewQuoteRequestFanout(job);
        break;
      default:
        throw new Error(`unsupported outbox jobType=${job.jobType}`);
    }
  } catch (error) {
    await notificationRepository.markOutboxFailure(
      job.id,
      toErrorMessage(error),
      job.attempts
    );
    throw error;
  }
};

/**
 * Outbox 워커 1틱 — claim → createMany 청크 → cursor/DONE/FAILED.
 * cron·부팅 catch-up 공용.
 */
export const processNotificationOutboxTick = async (): Promise<void> => {
  for (let i = 0; i < OUTBOX_MAX_CLAIMS_PER_TICK; i++) {
    const job = await notificationRepository.claimOutboxJob();
    if (!job) {
      return;
    }

    // claim 시 attempts 상한 도달로 FAILED 전환된 행 — 처리하지 않고 다음 claim
    if (job.status === 'FAILED') {
      console.error(
        `[notification-outbox] job id=${job.id} type=${job.jobType} sourceId=${job.sourceId} marked FAILED (max attempts)`
      );
      continue;
    }

    try {
      // markOutboxFailure에는 claim 반환 attempts(회수 포함 증가분)를 그대로 전달
      await processClaimedOutboxJob(job);
    } catch (error) {
      console.error(
        `[notification-outbox] job id=${job.id} type=${job.jobType} sourceId=${job.sourceId} failed`,
        error
      );
    }
  }
};

/**
 * 지정 견적 요청 생성 → 해당 기사에게 NEW_DESIGNATED_QUOTE_REQUEST_ARRIVED.
 * 이전에 일반 알림을 받았든 말든 항상 발송한다.
 */
export const notifyDesignatedQuoteRequestArrived = async (
  params: NotifyDesignatedQuoteRequestArrivedParams
): Promise<void> => {
  const customerName =
    (await notificationRepository.findUserNameById(params.customerId)) ??
    '고객';

  await createNotification({
    receiverId: params.moverId,
    type: 'NEW_DESIGNATED_QUOTE_REQUEST_ARRIVED',
    payload: {
      customerName,
      moveTypeLabel: toMoveTypeLabel(params.moveType),
    },
    estimateRequestId: params.estimateRequestId,
  });
};

/** 일반 견적 제안 도착 → 고객 (quote 도메인에서 호출용 export) */
export const notifyQuoteOfferArrived = async (params: {
  customerId: string;
  moverName: string;
  moveType: MoveType | null;
  quoteId: number;
  estimateRequestId: number;
  isDesignated: boolean;
  tx?: DbClient;
}): Promise<NotificationListItem> => {
  return createNotification({
    receiverId: params.customerId,
    type: params.isDesignated
      ? 'NEW_DESIGNATED_QUOTE_OFFER_ARRIVED'
      : 'NEW_QUOTE_OFFER_ARRIVED',
    payload: {
      moverName: params.moverName,
      moveTypeLabel: toMoveTypeLabel(params.moveType),
    },
    quoteId: params.quoteId,
    estimateRequestId: params.estimateRequestId,
    tx: params.tx,
  });
};

/**
 * quoteId만으로 견적 제안 알림 발송.
 * PENDING(PROPOSAL)만 처리 — 조회·문구 조립은 알림 도메인이 흡수한다.
 */
export const notifyQuoteOfferArrivedByQuoteId = async (
  quoteId: number
): Promise<NotificationListItem | null> => {
  const ctx =
    await notificationRepository.findQuoteNotificationContext(quoteId);

  // 견적 없음·기사 없음·PROPOSAL이 아니면 skip (REJECTION은 Sprint 3)
  if (!ctx?.moverId || ctx.status !== 'PENDING') {
    return null;
  }

  return notifyQuoteOfferArrived({
    customerId: ctx.customerId,
    moverName: ctx.moverName ?? '기사',
    moveType: ctx.moveType,
    quoteId: ctx.quoteId,
    estimateRequestId: ctx.estimateRequestId,
    isDesignated: ctx.isDesignated,
  });
};

/** 견적 확정 → 고객/기사 (피그마: `{moverName} 기사님의 견적이 확정되었어요`) */
export const notifyQuoteConfirmed = async (params: {
  receiverId: string;
  moverName: string;
  quoteId: number;
  estimateRequestId: number;
  tx?: DbClient;
}): Promise<NotificationListItem> => {
  return createNotification({
    receiverId: params.receiverId,
    type: 'QUOTE_CONFIRMED',
    payload: {
      moverName: params.moverName,
    },
    quoteId: params.quoteId,
    estimateRequestId: params.estimateRequestId,
    tx: params.tx,
  });
};

/**
 * quoteId만으로 견적 확정 알림 발송 — 고객·확정 기사 각 1건.
 * 동일 문구(QUOTE_CONFIRMED). 기사 id가 없으면 고객만 발송.
 */
export const notifyQuoteConfirmedByQuoteId = async (
  quoteId: number
): Promise<void> => {
  const ctx =
    await notificationRepository.findQuoteNotificationContext(quoteId);

  if (!ctx) {
    return;
  }

  const moverName = ctx.moverName ?? '기사';
  const base = {
    moverName,
    quoteId: ctx.quoteId,
    estimateRequestId: ctx.estimateRequestId,
  };

  const receivers = [ctx.customerId];
  if (ctx.moverId && ctx.moverId !== ctx.customerId) {
    receivers.push(ctx.moverId);
  }

  await Promise.all(
    receivers.map((receiverId) =>
      notifyQuoteConfirmed({ ...base, receiverId })
    )
  );
};

/** 지정 견적 반려 → 고객 */
export const notifyDesignatedQuoteRejected = async (params: {
  customerId: string;
  moverName: string;
  estimateRequestId: number;
  quoteId?: number;
  tx?: DbClient;
}): Promise<NotificationListItem> => {
  return createNotification({
    receiverId: params.customerId,
    type: 'DESIGNATED_QUOTE_REJECTED',
    payload: { moverName: params.moverName },
    estimateRequestId: params.estimateRequestId,
    quoteId: params.quoteId,
    tx: params.tx,
  });
};

/**
 * quoteId만으로 지정 견적 반려 알림.
 * REJECTED + isDesignated 인 경우만 고객에게 발송.
 */
export const notifyDesignatedQuoteRejectedByQuoteId = async (
  quoteId: number
): Promise<NotificationListItem | null> => {
  const ctx =
    await notificationRepository.findQuoteNotificationContext(quoteId);

  if (!ctx?.moverId || ctx.status !== 'REJECTED' || !ctx.isDesignated) {
    return null;
  }

  return notifyDesignatedQuoteRejected({
    customerId: ctx.customerId,
    moverName: ctx.moverName ?? '기사',
    estimateRequestId: ctx.estimateRequestId,
    quoteId: ctx.quoteId,
  });
};

/**
 * 이사 전날 리마인더 1건 생성.
 * 동일 (receiverId, type, estimateRequestId) 가 있으면 skip.
 */
export const createMoveDayReminderIfAbsent = async (params: {
  receiverId: string;
  type: 'CUSTOMER_MOVE_DAY_REMINDER' | 'MOVER_MOVE_DAY_REMINDER';
  estimateRequestId: number;
  payload: NotificationPayload;
}): Promise<NotificationListItem | null> => {
  const exists =
    await notificationRepository.existsByReceiverTypeAndEstimate(
      params.receiverId,
      params.type,
      params.estimateRequestId
    );

  if (exists) {
    return null;
  }

  return createNotification({
    receiverId: params.receiverId,
    type: params.type,
    payload: params.payload,
    estimateRequestId: params.estimateRequestId,
  });
};

/** 이사 완료 → 고객 리뷰 요청 (동일 estimateRequestId 중복 skip) */
export const notifyReviewRequested = async (
  params: NotifyReviewRequestedParams
): Promise<NotificationListItem | null> => {
  const exists =
    await notificationRepository.existsByReceiverTypeAndEstimate(
      params.customerId,
      'REVIEW_REQUESTED',
      params.estimateRequestId
    );

  if (exists) {
    return null;
  }

  return createNotification({
    receiverId: params.customerId,
    type: 'REVIEW_REQUESTED',
    payload: { moveTypeLabel: toMoveTypeLabel(params.moveType) },
    estimateRequestId: params.estimateRequestId,
  });
};

/** catch-up 1회당 처리 상한 — 누적분은 다음 cron/부팅에서 이어서 발송 */
const REVIEW_REQUESTED_CATCH_UP_LIMIT = 200;

/**
 * COMPLETED 요청 중 REVIEW_REQUESTED 미발송분만 발송.
 * status-change cron 직후·부팅 catch-up 공용.
 */
export const notifyMissingReviewRequestedForCompletedMoves =
  async (): Promise<void> => {
    const targets =
      await notificationRepository.findCompletedRequestsMissingReviewRequested(
        REVIEW_REQUESTED_CATCH_UP_LIMIT
      );

    for (const request of targets) {
      try {
        await notifyReviewRequested({
          customerId: request.userId,
          moveType: request.moveType,
          estimateRequestId: request.id,
        });
      } catch (error) {
        console.error(
          `[notifyMissingReviewRequested] estimateRequestId=${request.id} failed`,
          error
        );
      }
    }
  };

/** 리뷰 작성 → 기사 (고객 닉네임) */
export const notifyReviewWritten = async (
  params: NotifyReviewWrittenParams
): Promise<NotificationListItem> => {
  return createNotification({
    receiverId: params.moverId,
    type: 'REVIEW_WRITTEN',
    payload: { customerNickname: params.customerNickname },
    reviewId: params.reviewId,
    estimateRequestId: params.estimateRequestId,
  });
};

/** reviewId만으로 리뷰 작성 알림 */
export const notifyReviewWrittenByReviewId = async (
  reviewId: number
): Promise<NotificationListItem | null> => {
  const ctx =
    await notificationRepository.findReviewWrittenNotificationContext(
      reviewId
    );

  if (!ctx) {
    return null;
  }

  return notifyReviewWritten({
    moverId: ctx.moverId,
    customerNickname: ctx.customerNickname ?? '고객',
    reviewId: ctx.reviewId,
    estimateRequestId: ctx.estimateRequestId,
  });
};

/** 게시글 댓글 → 원글 작성자 (닉네임) */
export const notifyCommunityComment = async (
  params: NotifyCommunityCommentParams
): Promise<NotificationListItem> => {
  return createNotification({
    receiverId: params.receiverId,
    type: 'COMMUNITY_COMMENT',
    payload: {
      authorNickname: params.authorNickname,
      postId: String(params.postId),
    },
    commentId: params.commentId,
  });
};

/** 유저 정지 → 정지 당한 유저 */
export const notifySanction = async (
  params: NotifySanctionParams
): Promise<NotificationListItem> => {
  return createNotification({
    receiverId: params.receiverId,
    type: 'SANCTION_NOTIFIED',
    payload: {},
  });
};

/** 대댓글 → 부모 댓글 작성자 (닉네임) */
export const notifyCommunityReply = async (
  params: NotifyCommunityReplyParams
): Promise<NotificationListItem> => {
  return createNotification({
    receiverId: params.receiverId,
    type: 'COMMUNITY_REPLY',
    payload: {
      authorNickname: params.authorNickname,
      postId: String(params.postId),
    },
    commentId: params.commentId,
  });
};

/**
 * commentId만으로 원글 댓글/답글 알림.
 * 자기 글·자기 댓글에는 발송하지 않는다.
 */
export const notifyCommunityCommentOrReplyByCommentId = async (
  commentId: number
): Promise<NotificationListItem | null> => {
  const ctx =
    await notificationRepository.findCommunityCommentNotificationContext(
      commentId
    );

  if (!ctx) {
    return null;
  }

  const authorNickname = ctx.authorNickname ?? '사용자';

  if (ctx.isReply) {
    const receiverId = ctx.parentCommentAuthorId;
    if (!receiverId || receiverId === ctx.authorId) {
      return null;
    }

    return notifyCommunityReply({
      receiverId,
      authorNickname,
      commentId: ctx.commentId,
      postId: ctx.postId,
    });
  }

  if (ctx.postAuthorId === ctx.authorId) {
    return null;
  }

  return notifyCommunityComment({
    receiverId: ctx.postAuthorId,
    authorNickname,
    commentId: ctx.commentId,
    postId: ctx.postId,
  });
};

/** 신고로 게시글 삭제 → 원글 작성자 */
export const notifyPostRemovedByReport = async (
  params: NotifyPostRemovedByReportParams
): Promise<NotificationListItem> => {
  return createNotification({
    receiverId: params.receiverId,
    type: 'POST_REMOVED_BY_REPORT',
    payload: {},
    userReportId: params.userReportId,
  });
};

/**
 * userReportId만으로 신고 게시글 삭제 알림.
 * admin 신고 처리(삭제) mutation이 생기면 그 성공 직후 호출하면 된다.
 * 예: `await notificationService.notifyPostRemovedByReportByUserReportId(reportId)`
 */
export const notifyPostRemovedByReportByUserReportId = async (
  userReportId: number
): Promise<NotificationListItem | null> => {
  const ctx =
    await notificationRepository.findPostRemovedByReportNotificationContext(
      userReportId
    );

  if (!ctx) {
    return null;
  }

  return notifyPostRemovedByReport({
    receiverId: ctx.postAuthorId,
    userReportId: ctx.userReportId,
  });
};

/** 채팅방 최초 생성 → 상대 참여자 (이름 — 이사 견적 채팅) */
export const notifyChatRoomOpened = async (
  params: NotifyChatRoomOpenedParams
): Promise<NotificationListItem> => {
  return createNotification({
    receiverId: params.receiverId,
    type: 'CHAT_ROOM_OPENED',
    payload: {
      counterpartName: params.counterpartName,
      chatRoomId: String(params.chatRoomId),
    },
  });
};

/**
 * 채팅방 신규 생성(201) 직후 — 개설자를 제외한 참여자에게 1회.
 * 기존 방 재사용(200) 경로에서는 호출하지 않는다.
 */
export const notifyChatRoomOpenedToCounterparts = async (
  params: NotifyChatRoomOpenedToCounterpartsParams
): Promise<void> => {
  // creator 이름이 없으면 템플릿('{counterpartName}님과의…')이 깨지지 않도록 알림용 fallback
  const counterpartName =
    (await notificationRepository.findUserNameById(params.creatorId)) ??
    '상대방';

  const receivers = params.participantIds.filter(
    (id) => id !== params.creatorId
  );

  await Promise.all(
    receivers.map((receiverId) =>
      notifyChatRoomOpened({
        receiverId,
        counterpartName,
        chatRoomId: params.chatRoomId,
      })
    )
  );
};
