import type { MoveType, NotificationType, Prisma } from '@prisma/client';
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

/** 고객/기사 드롭다운용 최신 최대 10개 + totalCount */
export const getNotificationsForReceiver = async (receiverId: string) => {
  const { notifications, totalCount } =
    await notificationRepository.findLatestByReceiver(receiverId);

  return {
    notifications: notifications.map(toListItem),
    totalCount,
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

/**
 * 견적요청 제출 시 지정 기사에게 NEW_DESIGNATED_QUOTE_REQUEST_ARRIVED 알림.
 * 제출 성공 후 호출 — 알림 실패는 제출을 롤백하지 않는다.
 */
export const notifyDesignatedMoversOnEstimateSubmit = async (params: {
  estimateRequestId: number;
  customerId: string;
  moveType: MoveType | null;
}): Promise<void> => {
  const moverIds = await notificationRepository.findDesignatedMoverIds(
    params.estimateRequestId
  );

  if (moverIds.length === 0) {
    return;
  }

  const customerName =
    (await notificationRepository.findUserNameById(params.customerId)) ??
    '고객';
  const moveTypeLabel = toMoveTypeLabel(params.moveType);

  await Promise.all(
    moverIds.map((moverId) =>
      createNotification({
        receiverId: moverId,
        type: 'NEW_DESIGNATED_QUOTE_REQUEST_ARRIVED',
        payload: { customerName, moveTypeLabel },
        estimateRequestId: params.estimateRequestId,
      })
    )
  );
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
