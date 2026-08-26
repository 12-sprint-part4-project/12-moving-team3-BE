import {
  HistoryAction,
  Prisma,
  UserReportStatus,
  UserStatus,
  type UserReportTarget,
  type UserType,
} from '@prisma/client';
import {
  isSupportedReportTarget,
  type SupportedReportTarget,
} from '../constants/report-target.constants';
import type {
  AdminReportAvailableActionsDto,
  AdminReportDetailContentDto,
  AdminReportDetailCustomerProfileDto,
  AdminReportDetailDto,
  AdminReportDetailMoverProfileDto,
  AdminReportDetailReportedContentDto,
  AdminReportDetailReporterDto,
  AdminReportDetailTargetDto,
  AdminReportDetailTargetUserDto,
  AdminReportDetailUserProfileDto,
  AdminReportDetailUserSummaryDto,
  AdminReportListItemDto,
  AdminReportListResultDto,
  AdminReportRejectResultDto,
  AdminReportResolveResultDto,
  AdminReportTargetInfoDto,
} from '../dtos/admin-report.dto';
import {
  runAuditedTransaction,
  runWithManualAudit,
} from '../lib/audit-context';
import {
  buildAdminReportListWhere,
  findAdminReportById,
  findAdminReportFirst,
  findAdminReportsWithCount,
  findReportDetailTargetArticleById,
  findReportDetailTargetCommentById,
  findReportDetailTargetMessageById,
  findReportDetailTargetReviewById,
  findReportDetailTargetUserById,
  findReportReportedContent,
  findReportedUserProfile,
  findReportDetailSanctionTargetUser,
  findReportSanctionTargetUser,
  findReportTargetArticlesByIds,
  findReportTargetCommentsByIds,
  findReportTargetIdsByTargetUserKeyword,
  findReportTargetMessagesByIds,
  findReportTargetReviewsByIds,
  findReportTargetUsersByIds,
  getTotalReportCount,
  lockAdminReportForStatusChange,
  parseNumericTargetId,
  softDeleteReportReportedContent,
  updateAdminReportDecisionStatus,
  type AdminReportDetailRow,
  type AdminReportListRow,
  type AdminReportLockRow,
  type AdminReportTargetIdsByKeyword,
  type FindReportDetailSanctionTargetUserResult,
  type FindReportReportedContentResult,
  type FindReportedUserProfileResult,
  type FindReportSanctionTargetUserResult,
  type ReportDetailSanctionTargetUserRow,
  type SoftDeletableReportTarget,
} from '../repositories/admin-report.repository';
import {
  findAdminMemberStatus,
  lockAdminMemberForStatusChange,
  type AdminMemberStatusRow,
} from '../repositories/admin-member.repository';
import { createHistory } from '../repositories/history.repository';
import { upsertSuspendedUserStatus } from '../repositories/user-status.repository';
import type { SortDirection } from '../schemas/admin-list-query.schema';
import type {
  AdminReportDetailQuery,
  AdminReportListQuery,
  AdminReportProcessAction,
} from '../schemas/admin-report.schema';
import type { AdminStatisticsFilter } from '../schemas/admin-statistics.schema';
import { AppError } from '../utils/app.error';
import { createDateRange } from '../utils/admin-date-range.util';

/** 관리자 신고 정지 기간 — 회원 수동 정지와 동일하게 7일 고정 */
const ADMIN_REPORT_SUSPEND_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

/** History.tableName — Prisma @@map 과 동일하게 맞춘다 */
const USER_REPORT_TABLE_NAME = 'user_reports';
const USER_STATUS_TABLE_NAME = 'user_statuses';
const REVIEW_TABLE_NAME = 'reviews';
const POST_TABLE_NAME = 'posts';
const COMMENT_TABLE_NAME = 'comments';

/** 처리·반려 interactive transaction — 잠금 대기·전체 실행 상한 */
const ADMIN_REPORT_DECISION_TX_OPTIONS = {
  maxWait: 5_000,
  timeout: 10_000,
} as const;

/** 신고 대상별 허용 Action — DTO 통과 후에도 Service에서 다시 검증한다 */
const ALLOWED_ACTIONS_BY_TARGET: Record<
  SupportedReportTarget,
  ReadonlySet<AdminReportProcessAction>
> = {
  USER: new Set(['SUSPEND_TARGET_USER']),
  MESSAGE: new Set(['SUSPEND_TARGET_USER']),
  REVIEW: new Set(['SUSPEND_TARGET_USER', 'DELETE_REPORTED_CONTENT']),
  ARTICLE: new Set(['SUSPEND_TARGET_USER', 'DELETE_REPORTED_CONTENT']),
  COMMENT: new Set(['SUSPEND_TARGET_USER', 'DELETE_REPORTED_CONTENT']),
};

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

  const idsByTarget: Record<SupportedReportTarget, string[]> = {
    USER: [],
    REVIEW: [],
    MESSAGE: [],
    ARTICLE: [],
    COMMENT: [],
  };

  for (const item of items) {
    // 지원 대상만 배치 조회한다. 그 외 target은 targetInfo null로 남긴다.
    if (!isSupportedReportTarget(item.target)) {
      continue;
    }
    idsByTarget[item.target].push(item.targetId);
  }

  const userIds = [...new Set(idsByTarget.USER)];
  const reviewIds = toUniqueNumericTargetIds(idsByTarget.REVIEW);
  const messageIds = toUniqueNumericTargetIds(idsByTarget.MESSAGE);
  const articleIds = toUniqueNumericTargetIds(idsByTarget.ARTICLE);
  const commentIds = toUniqueNumericTargetIds(idsByTarget.COMMENT);

  const [users, reviews, messages, articles, comments] = await Promise.all([
    findReportTargetUsersByIds(userIds),
    findReportTargetReviewsByIds(reviewIds),
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
const toTargetInfoKey = (
  target: SupportedReportTarget,
  targetId: string
): string => {
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
  // 지원 대상만 Map에 넣으므로, 그 외·삭제·깨진 targetId는 null이다.
  targetInfo: isSupportedReportTarget(row.target)
    ? (targetInfoMap.get(toTargetInfoKey(row.target, row.targetId)) ?? null)
    : null,
  category: row.category,
  status: row.status,
  createdAt: row.createdAt,
});

/** 관리자 신고 목록 조회 — 필터·페이지네이션·신고자·대상 요약을 함께 반환한다 */
export const getAdminReportList = async (
  params: AdminReportListQuery
): Promise<AdminReportListResultDto> => {
  // 대상 사용자 이름이 있을 때만 targetId 후보를 조회한다. 없으면 undefined로 검색 필터를 끈다.
  let targetIds: AdminReportTargetIdsByKeyword | undefined;

  if (params.userName) {
    targetIds = await findReportTargetIdsByTargetUserKeyword(params.userName);
  }

  // reportedFrom/reportedTo는 params에 실려 Repository where builder로 전달된다.
  const { items, totalCount } = await findAdminReportsWithCount(
    params,
    targetIds
  );
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

/** USER 대상 Repository row — 프로필 select가 포함된 조회 결과 */
type ReportDetailTargetUserRow = NonNullable<
  Awaited<ReturnType<typeof findReportDetailTargetUserById>>
>;

/**
 * userType 기준으로 customer/mover 프로필만 매핑한다.
 * 반대 타입 프로필은 조회돼도 무시하고, 해당 타입 relation이 없으면 profile 전체를 null로 둔다.
 * 전화번호는 매핑하지 않는다.
 */
const toDetailUserProfile = (
  user: ReportDetailTargetUserRow
): AdminReportDetailUserProfileDto | null => {
  if (user.userType === 'CUSTOMER') {
    if (!user.customerProfile) {
      return null;
    }

    const customer: AdminReportDetailCustomerProfileDto = {
      region: user.customerProfile.region,
      service: user.customerProfile.service,
    };

    return { customer, mover: null };
  }

  if (user.userType === 'MOVER') {
    if (!user.moverProfile) {
      return null;
    }

    const mover: AdminReportDetailMoverProfileDto = {
      service: user.moverProfile.service,
      career: user.moverProfile.career,
      shortDescription: user.moverProfile.shortDescription,
      description: user.moverProfile.description,
      // DTO는 { region }[] 형태 — Repository select와 동일하게 지역 값만 담는다.
      serviceRegions: user.moverProfile.serviceRegions.map((item) => ({
        region: item.region,
      })),
    };

    return { customer: null, mover };
  }

  return null;
};

/**
 * USER 대상 전용 사용자 요약.
 * 다른 target의 toDetailUserSummary와 분리해 프로필 필드가 다른 응답을 건드리지 않게 한다.
 */
const toDetailTargetUserSummary = (
  user: ReportDetailTargetUserRow
): AdminReportDetailUserSummaryDto => ({
  id: user.id,
  name: user.name,
  nickname: user.nickname,
  email: user.email,
  userType: user.userType,
  isDeleted: user.deletedAt !== null,
  deletedAt: user.deletedAt,
  profileImageKey: user.profileImageKey,
  profile: toDetailUserProfile(user),
});

/**
 * 신고자 row → 상세 reporter DTO.
 * profileImageKey는 상세 select에 포함돼 있어 추가 조회 없이 매핑한다.
 * 관리자 API는 URL 변환 없이 key를 그대로 내려 회원 상세·targetInfo.user와 맞춘다.
 */
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
  profileImageKey: reporter.profileImageKey,
});

/** 대상 미존재 시에도 targetInfo 객체 형태를 유지한다 */
const toMissingTargetInfo = (
  type: SupportedReportTarget,
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
  type: SupportedReportTarget,
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

  // INAPPROPRIATE_PROFILE 포함, USER 대상이면 항상 프로필을 내려 응답 구조를 고정한다.
  const userSummary = toDetailTargetUserSummary(user);
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
      // 기존 metadata는 유지하고, 프로필 상세는 targetInfo.user.profile로 접근한다.
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
  target: SupportedReportTarget,
  targetId: string
): Promise<DetailTargetBundle> => {
  switch (target) {
    case 'USER':
      return loadUserReportTarget(targetId);
    case 'REVIEW':
      return loadReviewReportTarget(targetId);
    case 'MESSAGE':
      return loadMessageReportTarget(targetId);
    case 'ARTICLE':
      return loadArticleReportTarget(targetId);
    case 'COMMENT':
      return loadCommentReportTarget(targetId);
    default: {
      // 지원 대상 union이 늘어나도 누락 분기 없이 구조를 유지한다.
      const exhaustive: never = target;
      return toMissingTargetBundle(exhaustive, targetId);
    }
  }
};

/**
 * 제재 대상 사용자 행 → 상세 DTO.
 * userStatus가 없으면 회원 목록과 같이 ACTIVE·null로 정규화한다.
 * reportCount는 상세 전용 Repository 값을 그대로 쓰며 Service에서 재집계하지 않는다.
 */
const toDetailTargetUser = (
  user: ReportDetailSanctionTargetUserRow
): AdminReportDetailTargetUserDto => ({
  id: user.id,
  name: user.name,
  nickname: user.nickname,
  profileImageKey: user.profileImageKey,
  status: user.userStatus?.status ?? UserStatus.ACTIVE,
  suspendedAt: user.userStatus?.suspendedAt ?? null,
  suspendedUntil: user.userStatus?.suspendedUntil ?? null,
  reportCount: user.reportCount,
});

const toDetailTargetUserFromResult = (
  result: FindReportDetailSanctionTargetUserResult
): AdminReportDetailTargetUserDto | null => {
  if (result.kind !== 'found') {
    return null;
  }

  return toDetailTargetUser(result.user);
};

/** 신고 콘텐츠 조회 결과 → 판별 가능한 reportedContent DTO */
const toReportedContentFromResult = (
  result: FindReportReportedContentResult
): AdminReportDetailReportedContentDto | null => {
  switch (result.kind) {
    case 'review':
      return {
        type: 'REVIEW',
        id: String(result.content.id),
        rating: result.content.rating,
        content: result.content.content,
        createdAt: result.content.createdAt,
        updatedAt: result.content.updatedAt,
        deletedAt: result.content.deletedAt,
      };
    case 'article':
      return {
        type: 'ARTICLE',
        id: String(result.content.id),
        category: result.content.category,
        title: result.content.title,
        content: result.content.content,
        createdAt: result.content.createdAt,
        updatedAt: result.content.updatedAt,
        deletedAt: result.content.deletedAt,
      };
    case 'comment':
      return {
        type: 'COMMENT',
        id: String(result.content.id),
        postId: result.content.postId,
        parentId: result.content.parentId,
        content: result.content.content,
        createdAt: result.content.createdAt,
        deletedAt: result.content.deletedAt,
      };
    case 'message':
      return {
        type: 'MESSAGE',
        id: String(result.content.id),
        roomId: result.content.roomId,
        messageType: result.content.messageType,
        content: result.content.content,
        isFiltered: result.content.isFiltered,
        createdAt: result.content.createdAt,
      };
    case 'no_content':
    case 'not_found':
    case 'invalid_target_id':
      return null;
    default:
      return null;
  }
};

/**
 * USER 신고 프로필 조회 결과 → reportedContent DTO.
 * email·deletedAt 등 검토에 불필요한 필드는 매핑하지 않는다.
 * 사용자/프로필 없음은 null — targetUser·정지 Action과 독립이다.
 */
const toReportedUserProfileFromResult = (
  result: FindReportedUserProfileResult
): AdminReportDetailReportedContentDto | null => {
  if (result.kind === 'mover_profile') {
    const { profile } = result;
    return {
      type: 'USER',
      userType: 'MOVER',
      id: profile.id,
      name: profile.name,
      nickname: profile.nickname,
      profileImageKey: profile.profileImageKey,
      shortDescription: profile.moverProfile.shortDescription,
      description: profile.moverProfile.description,
      career: profile.moverProfile.career,
      service: profile.moverProfile.service,
      serviceRegions: profile.moverProfile.serviceRegions.map((item) => ({
        region: item.region,
      })),
    };
  }

  if (result.kind === 'customer_profile') {
    const { profile } = result;
    return {
      type: 'USER',
      userType: 'CUSTOMER',
      id: profile.id,
      name: profile.name,
      nickname: profile.nickname,
      profileImageKey: profile.profileImageKey,
      region: profile.customerProfile.region,
      service: profile.customerProfile.service,
    };
  }

  // not_found / profile_missing — invalid_target_id는 호출 전에 별도 처리한다.
  return null;
};

/**
 * 상세용 reportedContent 로드.
 * USER는 기존 findReportedUserProfile을 쓰고, 콘텐츠 대상은 findReportReportedContent를 유지한다.
 */
const loadReportedContentForDetail = async (
  target: SupportedReportTarget,
  targetId: string
): Promise<
  | { source: 'user_profile'; result: FindReportedUserProfileResult }
  | { source: 'content'; result: FindReportReportedContentResult }
> => {
  if (target === 'USER') {
    return {
      source: 'user_profile',
      result: await findReportedUserProfile(targetId),
    };
  }

  return {
    source: 'content',
    result: await findReportReportedContent(target, targetId),
  };
};

/**
 * availableActions 계산.
 * PENDING이 아니거나 대상을 못 찾으면 해당 Action은 false.
 * 삭제된 사용자는 정지 잠금이 실패하므로 canSuspendUser를 false로 둔다.
 * 이미 SUSPENDED여도 PENDING·활성 사용자면 정지 Action은 허용한다.
 */
const toAvailableActions = (
  status: UserReportStatus,
  target: SupportedReportTarget,
  userResult: FindReportSanctionTargetUserResult,
  contentResult: FindReportReportedContentResult
): AdminReportAvailableActionsDto => {
  if (status !== UserReportStatus.PENDING) {
    return { canSuspendUser: false, canDeleteContent: false };
  }

  // 처리 Service 잠금과 맞춰, soft-delete된 사용자에게는 정지 Action을 숨긴다.
  const canSuspendUser =
    userResult.kind === 'found' && userResult.user.deletedAt === null;

  if (target === 'USER' || target === 'MESSAGE') {
    return { canSuspendUser, canDeleteContent: false };
  }

  if (
    contentResult.kind === 'review' ||
    contentResult.kind === 'article' ||
    contentResult.kind === 'comment'
  ) {
    return {
      canSuspendUser,
      canDeleteContent: contentResult.content.deletedAt === null,
    };
  }

  return { canSuspendUser, canDeleteContent: false };
};

/**
 * 목록과 같은 createdAt+id 정렬에서 이전·다음 ID를 찾는다.
 * createdAt은 null이 아니므로 견적 요청의 nullable 날짜 분기는 쓰지 않는다.
 */
const findAdminReportNeighborIds = async (
  listWhere: Prisma.UserReportWhereInput,
  current: { id: number; createdAt: Date },
  sort: SortDirection
): Promise<{ prevId: number | null; nextId: number | null }> => {
  const inFilter = await findAdminReportFirst(
    { AND: [listWhere, { id: current.id }] },
    [{ id: 'desc' }]
  );

  if (inFilter == null) {
    return { prevId: null, nextId: null };
  }

  const isAsc = sort === 'ASC';
  const prevWhere: Prisma.UserReportWhereInput = isAsc
    ? {
        OR: [
          { createdAt: { lt: current.createdAt } },
          { createdAt: current.createdAt, id: { gt: current.id } },
        ],
      }
    : {
        OR: [
          { createdAt: { gt: current.createdAt } },
          { createdAt: current.createdAt, id: { gt: current.id } },
        ],
      };
  const nextWhere: Prisma.UserReportWhereInput = isAsc
    ? {
        OR: [
          { createdAt: { gt: current.createdAt } },
          { createdAt: current.createdAt, id: { lt: current.id } },
        ],
      }
    : {
        OR: [
          { createdAt: { lt: current.createdAt } },
          { createdAt: current.createdAt, id: { lt: current.id } },
        ],
      };
  const prevOrderBy: Prisma.UserReportOrderByWithRelationInput[] = isAsc
    ? [{ createdAt: 'desc' }, { id: 'asc' }]
    : [{ createdAt: 'asc' }, { id: 'asc' }];
  const nextOrderBy: Prisma.UserReportOrderByWithRelationInput[] = isAsc
    ? [{ createdAt: 'asc' }, { id: 'desc' }]
    : [{ createdAt: 'desc' }, { id: 'desc' }];

  const [prev, next] = await Promise.all([
    findAdminReportFirst({ AND: [listWhere, prevWhere] }, prevOrderBy),
    findAdminReportFirst({ AND: [listWhere, nextWhere] }, nextOrderBy),
  ]);

  return {
    prevId: prev?.id ?? null,
    nextId: next?.id ?? null,
  };
};

const resolveAdminReportListWhere = async (query: AdminReportDetailQuery) => {
  let targetIds: AdminReportTargetIdsByKeyword | undefined;

  if (query.userName) {
    targetIds = await findReportTargetIdsByTargetUserKeyword(query.userName);
  }

  return buildAdminReportListWhere({
    id: query.id,
    status: query.status,
    target: query.target,
    reportedFrom: query.reportedFrom,
    reportedTo: query.reportedTo,
    targetIds,
  });
};

/**
 * 관리자 신고 상세 조회.
 * 기존 targetInfo/content는 유지하고, 처리 Action용 targetUser·reportedContent를 추가한다.
 * query는 목록과 같은 필터·정렬로 prevId/nextId를 계산한다.
 */
export const getAdminReportDetail = async (
  reportId: number,
  query: AdminReportDetailQuery
): Promise<AdminReportDetailDto> => {
  const report = await findAdminReportById(reportId);

  // 목록과 달리 단건이므로 없으면 바로 404로 끊는다.
  if (!report) {
    throw new AppError('ADMIN_REPORT_NOT_FOUND');
  }

  // 앱에서 다루지 않는 대상은 상세 조립·Action 계산을 하지 않는다.
  if (!isSupportedReportTarget(report.target)) {
    throw new AppError('ADMIN_REPORT_UNSUPPORTED_TARGET');
  }

  // 기존 상세 조립과 Action용 조회를 병렬로 수행한다.
  // 상세 targetUser만 reportCount를 붙이고, 처리 경로의 findReportSanctionTargetUser는 집계하지 않는다.
  const [detailBundle, sanctionUserResult, reportedLoad] = await Promise.all([
    loadReportDetailTarget(report.target, report.targetId),
    findReportDetailSanctionTargetUser(report.target, report.targetId),
    loadReportedContentForDetail(report.target, report.targetId),
  ]);

  // 저장된 targetId 형식 이상은 요청 400이 아니라 서버 데이터 오류로 본다.
  if (
    sanctionUserResult.kind === 'invalid_target_id' ||
    reportedLoad.result.kind === 'invalid_target_id'
  ) {
    throw new AppError('INTERNAL_SERVER_ERROR');
  }

  const { targetInfo, content } = detailBundle;

  // USER는 프로필, 그 외는 콘텐츠 row. Action 계산용 content 결과는 USER에선 no_content로 둔다.
  const reportedContent =
    reportedLoad.source === 'user_profile'
      ? toReportedUserProfileFromResult(reportedLoad.result)
      : toReportedContentFromResult(reportedLoad.result);

  const contentResultForActions: FindReportReportedContentResult =
    reportedLoad.source === 'content'
      ? reportedLoad.result
      : { kind: 'no_content' };

  const listWhere = await resolveAdminReportListWhere(query);
  const { prevId, nextId } = await findAdminReportNeighborIds(
    listWhere,
    { id: report.id, createdAt: report.createdAt },
    query.sort ?? 'DESC'
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
    targetUser: toDetailTargetUserFromResult(sanctionUserResult),
    reportedContent,
    availableActions: toAvailableActions(
      report.status,
      report.target,
      sanctionUserResult,
      contentResultForActions
    ),
    prevId,
    nextId,
  };
};

export type ResolveAdminReportInput = {
  reportId: number;
  adminId: number;
  actions: AdminReportProcessAction[];
};

/** 신고 대상에 요청 Action이 모두 허용되는지 검사한다 */
const assertActionsAllowedForTarget = (
  target: UserReportTarget,
  actions: AdminReportProcessAction[]
) => {
  if (!isSupportedReportTarget(target)) {
    throw new AppError('ADMIN_REPORT_UNSUPPORTED_TARGET');
  }

  // DTO min(1)과 별도로, 빈 actions로 조치 없이 RESOLVED 되는 경로를 막는다.
  if (actions.length === 0) {
    throw new AppError('ADMIN_REPORT_INVALID_ACTIONS');
  }

  const allowed = ALLOWED_ACTIONS_BY_TARGET[target];

  for (const action of actions) {
    if (!allowed.has(action)) {
      throw new AppError('ADMIN_REPORT_INVALID_ACTIONS');
    }
  }
};

/**
 * History Json 컬럼용 상태 스냅샷 — admin-member 수동 History와 형식을 맞춘다.
 * Prisma Json은 Date/plain null을 그대로 받지 않으므로 ISO 문자열·DbNull로 정규화한다.
 */
const toStatusHistoryJson = (
  row: AdminMemberStatusRow | null
): Prisma.InputJsonValue | typeof Prisma.DbNull => {
  if (!row) {
    return Prisma.DbNull;
  }

  return {
    userId: row.userId,
    status: row.status,
    suspendedAt: row.suspendedAt?.toISOString() ?? null,
    suspendedUntil: row.suspendedUntil?.toISOString() ?? null,
  };
};

/** user_reports 최소 스냅샷 — 잠금 행 / UPDATE 결과 기준으로 before·after를 구성한다 */
const toUserReportHistoryJson = (row: {
  id: number;
  status: UserReportStatus;
  adminId: number | null;
}): Prisma.InputJsonValue => ({
  id: row.id,
  status: row.status,
  adminId: row.adminId,
});

/** soft delete History — Trigger와 같이 deleted_at null→not null 을 DELETE로 남긴다 */
const toContentDeleteHistoryJson = (row: {
  id: number;
  deletedAt: string | null;
}): Prisma.InputJsonValue => ({
  id: row.id,
  deletedAt: row.deletedAt,
});

const contentTableNameByTarget = (
  target: SoftDeletableReportTarget
): string => {
  switch (target) {
    case 'REVIEW':
      return REVIEW_TABLE_NAME;
    case 'ARTICLE':
      return POST_TABLE_NAME;
    case 'COMMENT':
      return COMMENT_TABLE_NAME;
    default: {
      const _exhaustive: never = target;
      return _exhaustive;
    }
  }
};

/**
 * SUSPEND_TARGET_USER — 대상 사용자 조회·잠금 후 7일 정지 + user_statuses History.
 * 기존 종료일이 더 미래면 upsertSuspendedUserStatus가 기간을 보존한다.
 * afterData는 RETURNING 결과를 그대로 써 임의 now+7d를 넣지 않는다.
 */
const executeSuspendTargetUser = async (
  target: UserReportTarget,
  targetId: string,
  processedAt: Date,
  adminId: number,
  tx: Prisma.TransactionClient
) => {
  const userResult = await findReportSanctionTargetUser(target, targetId, tx);

  if (userResult.kind === 'invalid_target_id') {
    // 저장된 신고 targetId 이상 — 요청 400이 아니다.
    throw new AppError('INTERNAL_SERVER_ERROR');
  }

  if (userResult.kind === 'not_found') {
    throw new AppError('ADMIN_REPORT_TARGET_USER_NOT_FOUND');
  }

  const lockedUser = await lockAdminMemberForStatusChange(
    userResult.user.id,
    tx
  );

  // soft-delete 회원은 잠금 대상에서 제외되므로 대상 없음으로 본다.
  if (!lockedUser) {
    throw new AppError('ADMIN_REPORT_TARGET_USER_NOT_FOUND');
  }

  // row 없으면 beforeData null → CREATE, 있으면 UPDATE (admin-member와 동일)
  const beforeData = await findAdminMemberStatus(userResult.user.id, tx);
  const afterData = await upsertSuspendedUserStatus(
    {
      userId: userResult.user.id,
      suspendedAt: processedAt,
      suspendedUntil: new Date(
        processedAt.getTime() + ADMIN_REPORT_SUSPEND_DURATION_MS
      ),
    },
    tx
  );

  await createHistory(
    {
      userId: null,
      adminUserId: adminId,
      tableName: USER_STATUS_TABLE_NAME,
      tableRowId: userResult.user.id,
      operationType:
        beforeData === null ? HistoryAction.CREATE : HistoryAction.UPDATE,
      beforeData: toStatusHistoryJson(beforeData),
      afterData: toStatusHistoryJson(afterData),
    },
    tx
  );
};

/**
 * DELETE_REPORTED_CONTENT — soft delete + 실제 변경 행만 DELETE History.
 * already_deleted는 성공으로 보고 신고 처리를 계속하되 History는 만들지 않는다.
 */
const executeDeleteReportedContent = async (
  target: UserReportTarget,
  targetId: string,
  processedAt: Date,
  adminId: number,
  tx: Prisma.TransactionClient
): Promise<boolean> => {
  const deleteResult = await softDeleteReportReportedContent(
    target,
    targetId,
    processedAt,
    tx
  );

  switch (deleteResult.kind) {
    case 'deleted': {
      const tableName = contentTableNameByTarget(deleteResult.target);

      // 실제 soft delete된 각 행(COMMENT면 부모+직계 대댓글)마다 History를 남긴다.
      for (const content of deleteResult.deletedContents) {
        await createHistory(
          {
            userId: null,
            adminUserId: adminId,
            tableName,
            tableRowId: String(content.id),
            operationType: HistoryAction.DELETE,
            beforeData: toContentDeleteHistoryJson({
              id: content.id,
              deletedAt: null,
            }),
            afterData: toContentDeleteHistoryJson({
              id: content.id,
              deletedAt: content.deletedAt.toISOString(),
            }),
          },
          tx
        );
      }

      // COMMENT 삭제 시 posts.commentCount UPDATE도 Trigger skip되므로 Service가 남긴다.
      if (deleteResult.postCommentCountChange) {
        const { postId, beforeCommentCount, afterCommentCount } =
          deleteResult.postCommentCountChange;

        await createHistory(
          {
            userId: null,
            adminUserId: adminId,
            tableName: POST_TABLE_NAME,
            tableRowId: String(postId),
            operationType: HistoryAction.UPDATE,
            beforeData: {
              id: postId,
              commentCount: beforeCommentCount,
            },
            afterData: {
              id: postId,
              commentCount: afterCommentCount,
            },
          },
          tx
        );
      }

      return false;
    }
    case 'already_deleted':
      // DB 변경이 없으므로 삭제 History를 만들지 않는다.
      return true;
    case 'not_found':
      throw new AppError('ADMIN_REPORT_CONTENT_NOT_FOUND');
    case 'invalid_target_id':
      throw new AppError('INTERNAL_SERVER_ERROR');
    case 'unsupported_target':
      throw new AppError('ADMIN_REPORT_INVALID_ACTIONS');
    default:
      throw new AppError('ADMIN_REPORT_INVALID_ACTIONS');
  }
};

/** PENDING → RESOLVED 변경에 대한 user_reports UPDATE History */
const createUserReportResolvedHistory = async (
  beforeReport: AdminReportLockRow,
  after: { id: number; status: UserReportStatus; adminId: number },
  adminId: number,
  tx: Prisma.TransactionClient
) => {
  await createHistory(
    {
      userId: null,
      adminUserId: adminId,
      tableName: USER_REPORT_TABLE_NAME,
      tableRowId: String(beforeReport.id),
      operationType: HistoryAction.UPDATE,
      beforeData: toUserReportHistoryJson({
        id: beforeReport.id,
        status: beforeReport.status,
        adminId: beforeReport.adminId,
      }),
      afterData: toUserReportHistoryJson({
        id: after.id,
        status: after.status,
        adminId: after.adminId,
      }),
    },
    tx
  );
};

/**
 * 관리자 신고 처리.
 * 신고 잠금 → Action 검증·실행 → RESOLVED → Service History를 한 트랜잭션으로 묶는다.
 * runWithManualAudit로 Trigger histories INSERT를 skip하고 createHistory만 남긴다.
 * adminId는 인증 정보에서 전달받으며 요청 body에 두지 않는다.
 */
export const resolveAdminReport = async ({
  reportId,
  adminId,
  actions,
}: ResolveAdminReportInput): Promise<AdminReportResolveResultDto> => {
  // 정지·삭제·상태 변경에 동일 시각을 쓴다.
  const processedAt = new Date();

  return runWithManualAudit(() =>
    runAuditedTransaction(async (tx) => {
      const report = await lockAdminReportForStatusChange(reportId, tx);

      if (!report) {
        throw new AppError('ADMIN_REPORT_NOT_FOUND');
      }

      if (report.status !== UserReportStatus.PENDING) {
        throw new AppError('ADMIN_REPORT_ALREADY_PROCESSED');
      }

      assertActionsAllowedForTarget(report.target, actions);

      const shouldSuspend = actions.includes('SUSPEND_TARGET_USER');
      const shouldDelete = actions.includes('DELETE_REPORTED_CONTENT');

      if (shouldSuspend) {
        await executeSuspendTargetUser(
          report.target,
          report.targetId,
          processedAt,
          adminId,
          tx
        );
      }

      let contentAlreadyDeleted: boolean | null = null;

      if (shouldDelete) {
        contentAlreadyDeleted = await executeDeleteReportedContent(
          report.target,
          report.targetId,
          processedAt,
          adminId,
          tx
        );
      }

      const statusUpdate = await updateAdminReportDecisionStatus(
        reportId,
        adminId,
        UserReportStatus.RESOLVED,
        tx
      );

      // 같은 트랜잭션에서 PENDING을 확인했으므로 실패는 경합·이상 상태로 본다.
      if (statusUpdate.kind === 'not_updated') {
        throw new AppError('ADMIN_REPORT_CONFLICT');
      }

      // 잠금 시점 before + UPDATE 결과 after로 신고 상태 History를 남긴다.
      await createUserReportResolvedHistory(
        report,
        statusUpdate.report,
        adminId,
        tx
      );

      return {
        reportId: statusUpdate.report.id,
        status: statusUpdate.report.status,
        adminId: statusUpdate.report.adminId,
        actions,
        processedAt,
        contentAlreadyDeleted,
      };
    }, ADMIN_REPORT_DECISION_TX_OPTIONS)
  );
};

export type RejectAdminReportInput = {
  reportId: number;
  adminId: number;
};

/**
 * 관리자 신고 반려.
 * 신고 잠금 후 PENDING → REJECTED → user_reports History를 한 트랜잭션으로 묶는다.
 * runWithManualAudit로 Trigger histories INSERT를 skip하고 createHistory만 남긴다.
 * 사용자·콘텐츠 제재는 하지 않으며, 대상 존재 여부와 무관하게 반려할 수 있다.
 */
export const rejectAdminReport = async ({
  reportId,
  adminId,
}: RejectAdminReportInput): Promise<AdminReportRejectResultDto> => {
  const processedAt = new Date();

  return runWithManualAudit(() =>
    runAuditedTransaction(async (tx) => {
      // resolve와 동일한 잠금 순서로 동시 처리·반려를 직렬화한다.
      const report = await lockAdminReportForStatusChange(reportId, tx);

      if (!report) {
        throw new AppError('ADMIN_REPORT_NOT_FOUND');
      }

      if (report.status !== UserReportStatus.PENDING) {
        throw new AppError('ADMIN_REPORT_ALREADY_PROCESSED');
      }

      const statusUpdate = await updateAdminReportDecisionStatus(
        reportId,
        adminId,
        UserReportStatus.REJECTED,
        tx
      );

      if (statusUpdate.kind === 'not_updated') {
        throw new AppError('ADMIN_REPORT_CONFLICT');
      }

      // RESOLVED와 동일한 { id, status, adminId } 스냅샷 — 잠금 before + UPDATE after
      await createHistory(
        {
          userId: null,
          adminUserId: adminId,
          tableName: USER_REPORT_TABLE_NAME,
          tableRowId: String(report.id),
          operationType: HistoryAction.UPDATE,
          beforeData: toUserReportHistoryJson({
            id: report.id,
            status: report.status,
            adminId: report.adminId,
          }),
          afterData: toUserReportHistoryJson({
            id: statusUpdate.report.id,
            status: statusUpdate.report.status,
            adminId: statusUpdate.report.adminId,
          }),
        },
        tx
      );

      return {
        reportId: statusUpdate.report.id,
        status: statusUpdate.report.status,
        adminId: statusUpdate.report.adminId,
        processedAt,
      };
    }, ADMIN_REPORT_DECISION_TX_OPTIONS)
  );
};
