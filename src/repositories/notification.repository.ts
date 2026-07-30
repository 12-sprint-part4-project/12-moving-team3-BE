import type { NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

type DbClient = Prisma.TransactionClient | typeof prisma;

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

/** 수신자 최신 알림 최대 10개 + 전체 건수 */
export const findLatestByReceiver = async (
  receiverId: string,
  db: DbClient = prisma
): Promise<{ notifications: NotificationRow[]; totalCount: number }> => {
  const [notifications, totalCount] = await Promise.all([
    db.notification.findMany({
      where: { receiverId },
      orderBy: { createdAt: 'desc' },
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

/** 유저 이름 조회 (알림 payload용) */
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
