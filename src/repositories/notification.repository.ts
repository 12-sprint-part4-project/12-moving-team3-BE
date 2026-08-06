import type {
  MoveType,
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
export interface FindMoverIdsForNewRequestParams {
  departureAddress: string | null;
  arrivalAddress: string | null;
  moveType: MoveType | null;
}

export const findMoverIdsForNewRequest = async (
  params: FindMoverIdsForNewRequestParams
): Promise<string[]> => {
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

/** 유저 닉네임(커뮤니티·리뷰 알림 payload용) */
export const findUserNicknameById = async (
  userId: string,
  db: DbClient = prisma
): Promise<string | null> => {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { nickname: true },
  });

  return user?.nickname ?? null;
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
