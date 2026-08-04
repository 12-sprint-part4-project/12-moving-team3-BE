import { Prisma, UserReportStatus, type UserReportTarget } from '@prisma/client';
import type {
  AdminReportListItemDto,
  AdminReportListResultDto,
  AdminReportTargetInfoDto,
} from '../dtos/admin-report.dto';
import {
  findAdminReportsWithCount,
  findReportTargetArticlesByIds,
  findReportTargetChatRoomsByIds,
  findReportTargetCommentsByIds,
  findReportTargetMessagesByIds,
  findReportTargetReviewsByIds,
  findReportTargetUsersByIds,
  getTotalReportCount,
  parseNumericTargetId,
  type AdminReportListRow,
} from '../repositories/admin-report.repository';
import type { AdminReportListQuery } from '../schemas/admin-report.schema';
import type { AdminStatisticsFilter } from '../schemas/admin-statistics.schema';
import { createDateRange } from '../utils/admin-date-range.util';

export const getReportStatistics = async ({
  startDate,
  endDate,
}: AdminStatisticsFilter) => {
  const dateRange = createDateRange(startDate, endDate);
  const where: Prisma.UserReportWhereInput = {
    ...(dateRange && { createdAt: dateRange }),
  };

  const [
    totalReportCount,
    pendingReportCount,
    resolvedReportCount,
    rejectedReportCount,
  ] = await Promise.all([
    getTotalReportCount(where),
    getTotalReportCount({ ...where, status: UserReportStatus.PENDING }),
    getTotalReportCount({ ...where, status: UserReportStatus.RESOLVED }),
    getTotalReportCount({ ...where, status: UserReportStatus.REJECTED }),
  ]);

  return {
    totalReportCount,
    pendingReportCount,
    resolvedReportCount,
    rejectedReportCount,
  };
};

/**
 * 폴리모픽 targetId를 타입별로 모아 배치 조회한다.
 * Prisma relation이 없으므로 Service에서 target별 Map을 만든 뒤 매핑한다.
 */
const loadTargetInfoMap = async (
  items: AdminReportListRow[]
): Promise<Map<string, AdminReportTargetInfoDto>> => {
  const infoByKey = new Map<string, AdminReportTargetInfoDto>();

  const idsByTarget: Record<UserReportTarget, string[]> = {
    USER: [],
    REVIEW: [],
    CHAT_ROOM: [],
    MESSAGE: [],
    ARTICLE: [],
    COMMENT: [],
  };

  for (const item of items) {
    idsByTarget[item.target].push(item.targetId);
  }

  const unique = (ids: string[]) => [...new Set(ids)];

  const userIds = unique(idsByTarget.USER);
  const reviewIds = unique(idsByTarget.REVIEW)
    .map(parseNumericTargetId)
    .filter((id): id is number => id !== null);
  const chatRoomIds = unique(idsByTarget.CHAT_ROOM)
    .map(parseNumericTargetId)
    .filter((id): id is number => id !== null);
  const messageIds = unique(idsByTarget.MESSAGE)
    .map(parseNumericTargetId)
    .filter((id): id is number => id !== null);
  const articleIds = unique(idsByTarget.ARTICLE)
    .map(parseNumericTargetId)
    .filter((id): id is number => id !== null);
  const commentIds = unique(idsByTarget.COMMENT)
    .map(parseNumericTargetId)
    .filter((id): id is number => id !== null);

  const [users, reviews, chatRooms, messages, articles, comments] =
    await Promise.all([
      findReportTargetUsersByIds(userIds),
      findReportTargetReviewsByIds(reviewIds),
      findReportTargetChatRoomsByIds(chatRoomIds),
      findReportTargetMessagesByIds(messageIds),
      findReportTargetArticlesByIds(articleIds),
      findReportTargetCommentsByIds(commentIds),
    ]);

  for (const user of users) {
    infoByKey.set(`USER:${user.id}`, {
      type: 'USER',
      id: user.id,
      name: user.name,
      nickname: user.nickname,
      email: user.email,
      userType: user.userType,
    });
  }

  for (const review of reviews) {
    infoByKey.set(`REVIEW:${review.id}`, {
      type: 'REVIEW',
      id: review.id,
      rating: review.rating,
      content: review.content,
      author: review.user
        ? {
            id: review.user.id,
            name: review.user.name,
            nickname: review.user.nickname,
          }
        : null,
    });
  }

  for (const room of chatRooms) {
    infoByKey.set(`CHAT_ROOM:${room.id}`, {
      type: 'CHAT_ROOM',
      id: room.id,
      roomType: room.roomType,
      createdAt: room.createdAt,
    });
  }

  for (const message of messages) {
    infoByKey.set(`MESSAGE:${message.id}`, {
      type: 'MESSAGE',
      id: message.id,
      content: message.content,
      messageType: message.messageType,
      sender: message.sender
        ? {
            id: message.sender.id,
            name: message.sender.name,
            nickname: message.sender.nickname,
          }
        : null,
    });
  }

  for (const article of articles) {
    infoByKey.set(`ARTICLE:${article.id}`, {
      type: 'ARTICLE',
      id: article.id,
      title: article.title,
      category: article.category,
      author: article.user
        ? {
            id: article.user.id,
            name: article.user.name,
            nickname: article.user.nickname,
          }
        : null,
    });
  }

  for (const comment of comments) {
    infoByKey.set(`COMMENT:${comment.id}`, {
      type: 'COMMENT',
      id: comment.id,
      content: comment.content,
      author: comment.user
        ? {
            id: comment.user.id,
            name: comment.user.name,
            nickname: comment.user.nickname,
          }
        : null,
    });
  }

  return infoByKey;
};

/** 대상 조회 키 — Int PK는 숫자로 정규화해 Map lookup과 맞춘다 */
const toTargetInfoKey = (target: UserReportTarget, targetId: string): string => {
  if (target === 'USER') {
    return `USER:${targetId}`;
  }

  const numericId = parseNumericTargetId(targetId);
  return numericId === null
    ? `${target}:${targetId}`
    : `${target}:${numericId}`;
};

const toAdminReportListItem = (
  row: AdminReportListRow,
  targetInfoMap: Map<string, AdminReportTargetInfoDto>
): AdminReportListItemDto => ({
  ...row,
  // 삭제되었거나 targetId가 깨진 경우 null로 내려 목록 UI가 fallback 처리할 수 있게 한다.
  targetInfo:
    targetInfoMap.get(toTargetInfoKey(row.target, row.targetId)) ?? null,
});

/** 관리자 신고 목록 조회 — 필터·페이지네이션·신고자·대상 요약을 함께 반환한다 */
export const getAdminReportList = async (
  params: AdminReportListQuery
): Promise<AdminReportListResultDto> => {
  const { items, totalCount } = await findAdminReportsWithCount(params);
  const targetInfoMap = await loadTargetInfoMap(items);

  return {
    items: items.map((row) => toAdminReportListItem(row, targetInfoMap)),
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      totalCount,
      totalPages: Math.ceil(totalCount / params.pageSize),
    },
  };
};
