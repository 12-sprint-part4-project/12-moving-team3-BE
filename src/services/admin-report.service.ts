import {
  Prisma,
  UserReportStatus,
  type UserReportTarget,
  type UserType,
} from '@prisma/client';
import type {
  AdminReportDetailContentDto,
  AdminReportDetailDto,
  AdminReportDetailReporterDto,
  AdminReportDetailTargetDto,
  AdminReportDetailUserSummaryDto,
  AdminReportListItemDto,
  AdminReportListResultDto,
  AdminReportTargetInfoDto,
} from '../dtos/admin-report.dto';
import {
  findAdminReportById,
  findAdminReportsWithCount,
  findReportDetailTargetArticleById,
  findReportDetailTargetChatRoomById,
  findReportDetailTargetCommentById,
  findReportDetailTargetMessageById,
  findReportDetailTargetReviewById,
  findReportDetailTargetUserById,
  findReportTargetArticlesByIds,
  findReportTargetChatRoomsByIds,
  findReportTargetCommentsByIds,
  findReportTargetMessagesByIds,
  findReportTargetReviewsByIds,
  findReportTargetUsersByIds,
  getTotalReportCount,
  parseNumericTargetId,
  type AdminReportDetailRow,
  type AdminReportListRow,
} from '../repositories/admin-report.repository';
import type { AdminReportListQuery } from '../schemas/admin-report.schema';
import type { AdminStatisticsFilter } from '../schemas/admin-statistics.schema';
import { AppError } from '../utils/app.error';
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

/** 중복 제거 후 Int PK로 정규화. 잘못된 targetId는 제외한다. */
const toUniqueNumericTargetIds = (targetIds: string[]): number[] =>
  [...new Set(targetIds)]
    .map(parseNumericTargetId)
    .filter((id): id is number => id !== null);

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

  const userIds = [...new Set(idsByTarget.USER)];
  const reviewIds = toUniqueNumericTargetIds(idsByTarget.REVIEW);
  const chatRoomIds = toUniqueNumericTargetIds(idsByTarget.CHAT_ROOM);
  const messageIds = toUniqueNumericTargetIds(idsByTarget.MESSAGE);
  const articleIds = toUniqueNumericTargetIds(idsByTarget.ARTICLE);
  const commentIds = toUniqueNumericTargetIds(idsByTarget.COMMENT);

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

/** Repository row → API 응답 DTO. Prisma payload를 그대로 노출하지 않는다. */
const toAdminReportListItem = (
  row: AdminReportListRow,
  targetInfoMap: Map<string, AdminReportTargetInfoDto>
): AdminReportListItemDto => ({
  id: row.id,
  reporterId: row.reporterId,
  reporter: {
    id: row.reporter.id,
    name: row.reporter.name,
    nickname: row.reporter.nickname,
    email: row.reporter.email,
    userType: row.reporter.userType,
  },
  target: row.target,
  targetId: row.targetId,
  // 삭제되었거나 targetId가 깨진 경우 null로 내려 목록 UI가 fallback 처리할 수 있게 한다.
  targetInfo:
    targetInfoMap.get(toTargetInfoKey(row.target, row.targetId)) ?? null,
  category: row.category,
  status: row.status,
  createdAt: row.createdAt,
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

/** soft-delete 사용자 row → 상세 사용자 요약. 없으면 null을 유지해 DTO 구조를 고정한다 */
const toDetailUserSummary = (
  user: {
    id: string;
    name: string;
    nickname: string;
    email: string;
    userType: UserType;
    deletedAt: Date | null;
  } | null
): AdminReportDetailUserSummaryDto | null => {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    nickname: user.nickname,
    email: user.email,
    userType: user.userType,
    isDeleted: user.deletedAt !== null,
    deletedAt: user.deletedAt,
  };
};

/** 신고자 row → 상세 reporter DTO */
const toDetailReporter = (
  reporter: AdminReportDetailRow['reporter']
): AdminReportDetailReporterDto => ({
  id: reporter.id,
  name: reporter.name,
  nickname: reporter.nickname,
  email: reporter.email,
  userType: reporter.userType,
  isDeleted: reporter.deletedAt !== null,
  deletedAt: reporter.deletedAt,
});

/** 대상 미존재 시에도 targetInfo 객체 형태를 유지한다 */
const toMissingTargetInfo = (
  type: UserReportTarget,
  targetId: string
): AdminReportDetailTargetDto => ({
  type,
  id: targetId,
  exists: false,
  isDeleted: false,
  user: null,
});

/**
 * soft-delete 가능 대상의 존재·삭제 상태.
 * 레코드가 있을 때만 호출한다 (없을 때는 toMissingTargetInfo 사용).
 */
const toSoftDeletePresence = (
  deletedAt: Date | null
): Pick<AdminReportDetailTargetDto, 'exists' | 'isDeleted'> => ({
  exists: true,
  // deletedAt이 있으면 삭제됨, null이면 활성 — 프론트가 두 상태를 구분한다.
  isDeleted: deletedAt !== null,
});

type DetailTargetBundle = {
  targetInfo: AdminReportDetailTargetDto;
  content: AdminReportDetailContentDto | null;
};

/** 대상 없음·잘못된 targetId 공통 fallback — 신고 상세 응답 구조는 유지한다 */
const toMissingTargetBundle = (
  type: UserReportTarget,
  targetId: string
): DetailTargetBundle => ({
  targetInfo: toMissingTargetInfo(type, targetId),
  content: null,
});

/** USER 대상 상세 — UUID 문자열 targetId를 그대로 조회한다 */
const loadUserReportTarget = async (
  targetId: string
): Promise<DetailTargetBundle> => {
  const user = await findReportDetailTargetUserById(targetId);
  if (!user) {
    return toMissingTargetBundle('USER', targetId);
  }

  const userSummary = toDetailUserSummary(user);
  return {
    targetInfo: {
      type: 'USER',
      id: targetId,
      ...toSoftDeletePresence(user.deletedAt),
      user: userSummary,
    },
    content: {
      type: 'USER',
      id: targetId,
      title: user.nickname || user.name,
      // 이름·이메일을 요약 body로 내려 상세 화면에서 프로필 맥락을 보여준다.
      body: `${user.name} · ${user.email}`,
      createdAt: user.createdAt,
      deletedAt: user.deletedAt,
      metadata: { userType: user.userType },
    },
  };
};

/** REVIEW 대상 상세 — 숫자 변환 실패도 미존재 fallback으로 처리한다 */
const loadReviewReportTarget = async (
  targetId: string
): Promise<DetailTargetBundle> => {
  const id = parseNumericTargetId(targetId);
  if (id === null) {
    return toMissingTargetBundle('REVIEW', targetId);
  }

  const review = await findReportDetailTargetReviewById(id);
  if (!review) {
    return toMissingTargetBundle('REVIEW', targetId);
  }

  return {
    targetInfo: {
      type: 'REVIEW',
      id: targetId,
      ...toSoftDeletePresence(review.deletedAt),
      user: toDetailUserSummary(review.user),
    },
    content: {
      type: 'REVIEW',
      id: String(review.id),
      title: '리뷰',
      body: review.content,
      createdAt: review.createdAt,
      deletedAt: review.deletedAt,
      metadata: { rating: review.rating },
    },
  };
};

/** CHAT_ROOM 대상 상세 — soft-delete 컬럼이 없어 존재 시 isDeleted: false */
const loadChatRoomReportTarget = async (
  targetId: string
): Promise<DetailTargetBundle> => {
  const id = parseNumericTargetId(targetId);
  if (id === null) {
    return toMissingTargetBundle('CHAT_ROOM', targetId);
  }

  const room = await findReportDetailTargetChatRoomById(id);
  if (!room) {
    return toMissingTargetBundle('CHAT_ROOM', targetId);
  }

  return {
    targetInfo: {
      type: 'CHAT_ROOM',
      id: targetId,
      exists: true,
      isDeleted: false,
      user: null,
    },
    content: {
      type: 'CHAT_ROOM',
      id: String(room.id),
      title: '채팅방',
      body: null,
      createdAt: room.createdAt,
      deletedAt: null,
      metadata: {
        roomType: room.roomType,
        estimateRequestId: room.estimateRequestId,
        quoteId: room.quoteId,
        lastMessageAt: room.lastMessageAt,
      },
    },
  };
};

/** MESSAGE 대상 상세 — soft-delete가 없어 존재 시 isDeleted: false */
const loadMessageReportTarget = async (
  targetId: string
): Promise<DetailTargetBundle> => {
  const id = parseNumericTargetId(targetId);
  if (id === null) {
    return toMissingTargetBundle('MESSAGE', targetId);
  }

  const message = await findReportDetailTargetMessageById(id);
  if (!message) {
    return toMissingTargetBundle('MESSAGE', targetId);
  }

  return {
    targetInfo: {
      type: 'MESSAGE',
      id: targetId,
      exists: true,
      isDeleted: false,
      user: toDetailUserSummary(message.sender),
    },
    content: {
      type: 'MESSAGE',
      id: String(message.id),
      title: '채팅 메시지',
      body: message.content,
      createdAt: message.createdAt,
      deletedAt: null,
      metadata: {
        messageType: message.messageType,
        roomId: message.roomId,
      },
    },
  };
};

/** ARTICLE(Post) 대상 상세 */
const loadArticleReportTarget = async (
  targetId: string
): Promise<DetailTargetBundle> => {
  const id = parseNumericTargetId(targetId);
  if (id === null) {
    return toMissingTargetBundle('ARTICLE', targetId);
  }

  const article = await findReportDetailTargetArticleById(id);
  if (!article) {
    return toMissingTargetBundle('ARTICLE', targetId);
  }

  return {
    targetInfo: {
      type: 'ARTICLE',
      id: targetId,
      ...toSoftDeletePresence(article.deletedAt),
      user: toDetailUserSummary(article.user),
    },
    content: {
      type: 'ARTICLE',
      id: String(article.id),
      title: article.title,
      body: article.content,
      createdAt: article.createdAt,
      deletedAt: article.deletedAt,
      // region은 Repository select에 없으므로 실제 조회된 category만 담는다.
      metadata: { category: article.category },
    },
  };
};

/** COMMENT 대상 상세 */
const loadCommentReportTarget = async (
  targetId: string
): Promise<DetailTargetBundle> => {
  const id = parseNumericTargetId(targetId);
  if (id === null) {
    return toMissingTargetBundle('COMMENT', targetId);
  }

  const comment = await findReportDetailTargetCommentById(id);
  if (!comment) {
    return toMissingTargetBundle('COMMENT', targetId);
  }

  return {
    targetInfo: {
      type: 'COMMENT',
      id: targetId,
      ...toSoftDeletePresence(comment.deletedAt),
      user: toDetailUserSummary(comment.user),
    },
    content: {
      type: 'COMMENT',
      id: String(comment.id),
      title: '댓글',
      body: comment.content,
      createdAt: comment.createdAt,
      deletedAt: comment.deletedAt,
      // parentId는 Repository select에 없으므로 조회된 postId·게시글 제목만 담는다.
      metadata: {
        postId: comment.postId,
        postTitle: comment.post?.title ?? null,
        postDeletedAt: comment.post?.deletedAt ?? null,
      },
    },
  };
};

/** target 타입별 Repository 조회 후 targetInfo·content를 조립한다 */
const loadReportDetailTarget = async (
  target: UserReportTarget,
  targetId: string
): Promise<DetailTargetBundle> => {
  switch (target) {
    case 'USER':
      return loadUserReportTarget(targetId);
    case 'REVIEW':
      return loadReviewReportTarget(targetId);
    case 'CHAT_ROOM':
      return loadChatRoomReportTarget(targetId);
    case 'MESSAGE':
      return loadMessageReportTarget(targetId);
    case 'ARTICLE':
      return loadArticleReportTarget(targetId);
    case 'COMMENT':
      return loadCommentReportTarget(targetId);
    default:
      // Prisma enum 외 값이 들어오면 대상 없음으로 안전하게 처리한다.
      return toMissingTargetBundle(target, targetId);
  }
};

/**
 * 관리자 신고 상세 조회.
 * Repository에서 신고·대상을 조회한 뒤 AdminReportDetailDto로 매핑한다.
 */
export const getAdminReportDetail = async (
  reportId: number
): Promise<AdminReportDetailDto> => {
  const report = await findAdminReportById(reportId);

  // 목록과 달리 단건이므로 없으면 바로 404로 끊는다.
  if (!report) {
    throw new AppError('ADMIN_REPORT_NOT_FOUND');
  }

  const { targetInfo, content } = await loadReportDetailTarget(
    report.target,
    report.targetId
  );

  return {
    id: report.id,
    target: report.target,
    targetId: report.targetId,
    category: report.category,
    status: report.status,
    adminId: report.adminId,
    admin: report.admin
      ? {
          id: report.admin.id,
          name: report.admin.name,
          email: report.admin.email,
        }
      : null,
    createdAt: report.createdAt,
    reporter: toDetailReporter(report.reporter),
    targetInfo,
    content,
  };
};
