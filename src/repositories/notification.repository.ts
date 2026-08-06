import type {
  MoveType,
  NotificationType,
  Prisma,
  QuoteStatus,
  Region,
} from '@prisma/client';
import { Region as RegionEnum } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getRegionAddressKeywords } from '../utils/region.util';

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

/**
 * 일반 견적 요청 알림 대상 — 출발/도착 주소가 서비스 지역과 매칭되고
 * 프로필 service에 이사유형이 포함된 기사 (받은 견적 요청 serviceArea 필터와 동일 기준)
 */
export const findMoverIdsForNewRequest = async (params: {
  departureAddress: string | null;
  arrivalAddress: string | null;
  moveType: MoveType | null;
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
    },
    select: { userId: true },
  });

  return profiles.map((profile) => profile.userId);
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
