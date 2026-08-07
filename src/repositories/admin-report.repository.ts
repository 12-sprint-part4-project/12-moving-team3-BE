import { Prisma, UserReportTarget } from '@prisma/client';
import { prisma } from '../lib/prisma';
import type { AdminReportListQuery } from '../schemas/admin-report.schema';
import { createDateRange } from '../utils/admin-date-range.util';

type DbClient = typeof prisma | Prisma.TransactionClient;

export const getTotalReportCount = async (
  where: Prisma.UserReportWhereInput
) => {
  return prisma.userReport.count({ where });
};

export const getUserReportRecentActivities = async (
  where: Prisma.UserReportWhereInput
) => {
  return prisma.userReport.findMany({
    where,
    select: {
      id: true,
      createdAt: true,
      target: true,
      category: true,
      status: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 5,
  });
};

/** 신고 목록 select — reporter FK를 include해 N+1 없이 신고자 요약을 붙인다 */
const adminReportListSelect = {
  id: true,
  reporterId: true,
  target: true,
  targetId: true,
  category: true,
  status: true,
  createdAt: true,
  // 댓글 목록의 userId+user 패턴처럼 FK id와 요약 객체를 함께 내려준다.
  reporter: {
    select: {
      id: true,
      name: true,
      nickname: true,
      email: true,
      userType: true,
    },
  },
} satisfies Prisma.UserReportSelect;

export type AdminReportListRow = Prisma.UserReportGetPayload<{
  select: typeof adminReportListSelect;
}>;

/** 검색어로 찾은 대상 사용자·콘텐츠의 targetId 후보 (UserReport.targetId와 맞춰 string) */
export type AdminReportTargetIdsByKeyword = {
  userIds: string[];
  reviewIds: string[];
  messageIds: string[];
  articleIds: string[];
  commentIds: string[];
  chatRoomIds: string[];
};

type AdminReportListWhereParams = Pick<
  AdminReportListQuery,
  'status' | 'target' | 'reportedFrom' | 'reportedTo'
> & {
  /**
   * 검색어로 미리 조회한 targetId 묶음.
   * undefined면 검색 필터 미적용(기존 목록 호출과 동일), 빈 묶음이면 0건.
   */
  targetIds?: AdminReportTargetIdsByKeyword;
};

/** target별 id 묶음을 UserReport OR 조건으로 변환. 빈 배열 분기는 넣지 않는다. */
const buildTargetIdSearchOrConditions = (
  targetIds: AdminReportTargetIdsByKeyword
): Prisma.UserReportWhereInput[] => {
  const conditions: Prisma.UserReportWhereInput[] = [];

  if (targetIds.userIds.length > 0) {
    conditions.push({
      target: UserReportTarget.USER,
      targetId: { in: targetIds.userIds },
    });
  }

  if (targetIds.reviewIds.length > 0) {
    conditions.push({
      target: UserReportTarget.REVIEW,
      targetId: { in: targetIds.reviewIds },
    });
  }

  if (targetIds.messageIds.length > 0) {
    conditions.push({
      target: UserReportTarget.MESSAGE,
      targetId: { in: targetIds.messageIds },
    });
  }

  if (targetIds.articleIds.length > 0) {
    conditions.push({
      target: UserReportTarget.ARTICLE,
      targetId: { in: targetIds.articleIds },
    });
  }

  if (targetIds.commentIds.length > 0) {
    conditions.push({
      target: UserReportTarget.COMMENT,
      targetId: { in: targetIds.commentIds },
    });
  }

  if (targetIds.chatRoomIds.length > 0) {
    conditions.push({
      target: UserReportTarget.CHAT_ROOM,
      targetId: { in: targetIds.chatRoomIds },
    });
  }

  return conditions;
};

/**
 * status·target·신고일·대상 사용자 검색을 AND로 합친다.
 * target + 검색이 함께 오면 Prisma가 둘 다 만족하는 행만 남긴다
 * (예: target=REVIEW AND OR(... REVIEW targetId ...)).
 */
const buildAdminReportListWhere = (
  params: AdminReportListWhereParams
): Prisma.UserReportWhereInput => {
  // 회원 목록과 동일: reportedFrom이 없으면 기간 필터를 두지 않는다.
  const dateRange = createDateRange(params.reportedFrom, params.reportedTo);

  const where: Prisma.UserReportWhereInput = {
    ...(dateRange && { createdAt: dateRange }),
  };

  if (params.status) {
    where.status = params.status;
  }

  if (params.target) {
    where.target = params.target;
  }

  // keyword 자체는 where에 넣지 않고, Service가 넘긴 targetId 묶음만 반영한다.
  if (params.targetIds) {
    const targetIdOrConditions = buildTargetIdSearchOrConditions(
      params.targetIds
    );

    if (targetIdOrConditions.length === 0) {
      // 검색 후보가 하나도 없으면 IN []로 목록·count 모두 0건이 되게 한다.
      where.id = { in: [] };
    } else {
      where.OR = targetIdOrConditions;
    }
  }

  return where;
};

/** 관리자 신고 목록 + 전체 건수 조회 (totalPages는 Service에서 계산) */
export const findAdminReportsWithCount = async (
  params: AdminReportListQuery,
  // Service 연결 전에도 선택적으로 넘겨 같은 where를 list/count에 쓸 수 있게 둔다.
  targetIds?: AdminReportTargetIdsByKeyword
): Promise<{ items: AdminReportListRow[]; totalCount: number }> => {
  const where = buildAdminReportListWhere({
    status: params.status,
    target: params.target,
    reportedFrom: params.reportedFrom,
    reportedTo: params.reportedTo,
    targetIds,
  });
  const skip = (params.page - 1) * params.pageSize;

  const [items, totalCount] = await prisma.$transaction([
    prisma.userReport.findMany({
      where,
      select: adminReportListSelect,
      // createdAt이 같으면 id로 tie-break해 offset 페이지네이션 순서를 안정화한다.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take: params.pageSize,
    }),
    prisma.userReport.count({ where }),
  ]);

  return { items, totalCount };
};

/**
 * 신고 대상 사용자 검색 시 사용자 조회 상한.
 * 이름/닉네임/이메일이 흔한 단어도 있어, 무제한 contains는 목록 필터를 과도하게 넓힌다.
 */
const REPORT_TARGET_USER_SEARCH_LIMIT = 100;

/**
 * target별 콘텐츠 ID 조회 상한.
 * UserReport.targetId IN (...)에 넣을 후보를 제한해 쿼리 크기를 고정한다.
 */
const REPORT_TARGET_CONTENT_ID_SEARCH_LIMIT = 500;

const EMPTY_REPORT_TARGET_IDS_BY_KEYWORD: AdminReportTargetIdsByKeyword = {
  userIds: [],
  reviewIds: [],
  messageIds: [],
  articleIds: [],
  commentIds: [],
  chatRoomIds: [],
};

/**
 * 신고 대상 사용자 검색어로 target 타입별 targetId 목록을 조회한다.
 * buildAdminReportListWhere가 이 결과를 OR 조건으로 받아 목록을 좁힌다.
 *
 * - USER: 일치 사용자 id
 * - REVIEW/ARTICLE/COMMENT: 작성자 userId
 * - MESSAGE: 발신자 senderId
 * - CHAT_ROOM: 참여자 participantId
 *
 * deletedAt은 걸지 않는다 — 탈퇴·삭제된 대상의 신고도 관리자가 검색할 수 있어야 한다.
 */
export const findReportTargetIdsByTargetUserKeyword = async (
  keyword: string,
  db: DbClient = prisma
): Promise<AdminReportTargetIdsByKeyword> => {
  // take 결과는 DB 기본 순서가 비결정적이므로, 최신 우선으로 후보를 고정한다.
  const matchedUsers = await db.user.findMany({
    where: {
      OR: [
        { name: { contains: keyword, mode: 'insensitive' } },
        { nickname: { contains: keyword, mode: 'insensitive' } },
        { email: { contains: keyword, mode: 'insensitive' } },
      ],
    },
    select: { id: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: REPORT_TARGET_USER_SEARCH_LIMIT,
  });

  if (matchedUsers.length === 0) {
    return EMPTY_REPORT_TARGET_IDS_BY_KEYWORD;
  }

  const userIds = matchedUsers.map((user) => user.id);

  const [reviews, messages, articles, comments, chatRooms] = await Promise.all([
    db.review.findMany({
      where: { userId: { in: userIds } },
      select: { id: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: REPORT_TARGET_CONTENT_ID_SEARCH_LIMIT,
    }),
    db.chatMessage.findMany({
      where: { senderId: { in: userIds } },
      select: { id: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: REPORT_TARGET_CONTENT_ID_SEARCH_LIMIT,
    }),
    db.post.findMany({
      where: { userId: { in: userIds } },
      select: { id: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: REPORT_TARGET_CONTENT_ID_SEARCH_LIMIT,
    }),
    db.comment.findMany({
      where: { userId: { in: userIds } },
      select: { id: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: REPORT_TARGET_CONTENT_ID_SEARCH_LIMIT,
    }),
    // 참여자 중 한 명이라도 검색 사용자면 해당 방 id를 후보에 넣는다.
    db.chatRoom.findMany({
      where: {
        participants: {
          some: { participantId: { in: userIds } },
        },
      },
      select: { id: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: REPORT_TARGET_CONTENT_ID_SEARCH_LIMIT,
    }),
  ]);

  return {
    userIds,
    reviewIds: reviews.map((row) => String(row.id)),
    messageIds: messages.map((row) => String(row.id)),
    articleIds: articles.map((row) => String(row.id)),
    commentIds: comments.map((row) => String(row.id)),
    chatRoomIds: chatRooms.map((row) => String(row.id)),
  };
};

/** targetId 문자열을 Int PK용 숫자로 변환. 유효하지 않으면 null */
export const parseNumericTargetId = (targetId: string): number | null => {
  if (!/^[1-9]\d*$/.test(targetId)) {
    return null;
  }

  const id = Number(targetId);

  // Prisma Int 범위를 벗어나면 조회하지 않고 null로 둔다.
  if (!Number.isSafeInteger(id) || id < 1 || id > 2_147_483_647) {
    return null;
  }

  return id;
};

const targetAuthorSelect = {
  id: true,
  name: true,
  nickname: true,
} satisfies Prisma.UserSelect;

/** USER 대상 배치 조회 — soft-delete된 유저는 목록에서 null 처리하기 위해 제외한다 */
export const findReportTargetUsersByIds = async (
  ids: string[],
  db: DbClient = prisma
) => {
  if (ids.length === 0) {
    return [];
  }

  return db.user.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: {
      id: true,
      name: true,
      nickname: true,
      email: true,
      userType: true,
    },
  });
};

/** REVIEW 대상 배치 조회 */
export const findReportTargetReviewsByIds = async (
  ids: number[],
  db: DbClient = prisma
) => {
  if (ids.length === 0) {
    return [];
  }

  return db.review.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: {
      id: true,
      rating: true,
      content: true,
      user: { select: targetAuthorSelect },
    },
  });
};

/** CHAT_ROOM 대상 배치 조회 */
export const findReportTargetChatRoomsByIds = async (
  ids: number[],
  db: DbClient = prisma
) => {
  if (ids.length === 0) {
    return [];
  }

  return db.chatRoom.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      roomType: true,
      createdAt: true,
    },
  });
};

/** MESSAGE 대상 배치 조회 */
export const findReportTargetMessagesByIds = async (
  ids: number[],
  db: DbClient = prisma
) => {
  if (ids.length === 0) {
    return [];
  }

  return db.chatMessage.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      content: true,
      messageType: true,
      sender: { select: targetAuthorSelect },
    },
  });
};

/** ARTICLE(Post) 대상 배치 조회 */
export const findReportTargetArticlesByIds = async (
  ids: number[],
  db: DbClient = prisma
) => {
  if (ids.length === 0) {
    return [];
  }

  return db.post.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: {
      id: true,
      title: true,
      category: true,
      user: { select: targetAuthorSelect },
    },
  });
};

/** COMMENT 대상 배치 조회 */
export const findReportTargetCommentsByIds = async (
  ids: number[],
  db: DbClient = prisma
) => {
  if (ids.length === 0) {
    return [];
  }

  return db.comment.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: {
      id: true,
      content: true,
      user: { select: targetAuthorSelect },
    },
  });
};

// --- 신고 상세 조회 ---
// 목록 배치 조회와 달리 soft-delete 행도 가져와 Service가 exists/isDeleted를 구분하게 한다.

/** 상세용 사용자 요약 — 탈퇴 판단을 위해 deletedAt을 포함한다 */
const detailUserSummarySelect = {
  id: true,
  name: true,
  nickname: true,
  email: true,
  userType: true,
  deletedAt: true,
} satisfies Prisma.UserSelect;

/** 신고 상세 select — reporter 탈퇴 정보·처리 admin을 FK로 함께 조회한다 */
const adminReportDetailSelect = {
  id: true,
  reporterId: true,
  target: true,
  targetId: true,
  category: true,
  status: true,
  adminId: true,
  createdAt: true,
  reporter: {
    select: detailUserSummarySelect,
  },
  admin: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} satisfies Prisma.UserReportSelect;

export type AdminReportDetailRow = Prisma.UserReportGetPayload<{
  select: typeof adminReportDetailSelect;
}>;

/**
 * 신고 단건 조회.
 * 없으면 null을 반환하고, 404 판단은 Service에서 한다.
 */
export const findAdminReportById = async (
  reportId: number,
  db: DbClient = prisma
): Promise<AdminReportDetailRow | null> => {
  return db.userReport.findUnique({
    where: { id: reportId },
    select: adminReportDetailSelect,
  });
};

/**
 * USER 대상 상세 조회 전용 select.
 * detailUserSummarySelect(reporter·다른 target 작성자)와 분리해,
 * 프로필 보강 필드가 다른 조회 경로에 영향을 주지 않게 한다.
 * 전화번호·비밀번호·인증 계정 등 민감 정보는 포함하지 않는다.
 */
const REPORT_DETAIL_TARGET_USER_SELECT = {
  id: true,
  name: true,
  nickname: true,
  email: true,
  userType: true,
  deletedAt: true,
  createdAt: true,
  profileImageKey: true,
  customerProfile: {
    select: {
      region: true,
      service: true,
    },
  },
  moverProfile: {
    select: {
      service: true,
      career: true,
      shortDescription: true,
      description: true,
      serviceRegions: {
        select: {
          region: true,
        },
      },
    },
  },
} satisfies Prisma.UserSelect;

/**
 * USER 대상 단건.
 * User.id는 UUID 문자열이며 UserReport.targetId(VarChar)와 타입이 같다.
 * soft-delete도 포함해 탈퇴 여부를 Service에서 판단한다.
 */
export const findReportDetailTargetUserById = async (
  id: string,
  db: DbClient = prisma
) => {
  return db.user.findUnique({
    where: { id },
    select: REPORT_DETAIL_TARGET_USER_SELECT,
  });
};

/**
 * REVIEW 대상 단건.
 * deletedAt 필터 없이 조회해 삭제된 리뷰도 상세에서 확인할 수 있게 한다.
 */
export const findReportDetailTargetReviewById = async (
  id: number,
  db: DbClient = prisma
) => {
  return db.review.findUnique({
    where: { id },
    select: {
      id: true,
      rating: true,
      content: true,
      createdAt: true,
      deletedAt: true,
      user: { select: detailUserSummarySelect },
    },
  });
};

/**
 * CHAT_ROOM 대상 단건.
 * ChatRoom에는 deletedAt이 없어 존재 여부만 확인한다.
 * participants는 상세 metadata에 쓰지 않으므로 조회하지 않는다.
 */
export const findReportDetailTargetChatRoomById = async (
  id: number,
  db: DbClient = prisma
) => {
  return db.chatRoom.findUnique({
    where: { id },
    select: {
      id: true,
      roomType: true,
      createdAt: true,
      lastMessageAt: true,
      estimateRequestId: true,
      quoteId: true,
    },
  });
};

/**
 * MESSAGE 대상 단건.
 * ChatMessage에는 deletedAt이 없고, 상세 DTO·목록과 같이 attachments는 조회하지 않는다.
 */
export const findReportDetailTargetMessageById = async (
  id: number,
  db: DbClient = prisma
) => {
  return db.chatMessage.findUnique({
    where: { id },
    select: {
      id: true,
      content: true,
      messageType: true,
      createdAt: true,
      roomId: true,
      sender: { select: detailUserSummarySelect },
    },
  });
};

/**
 * ARTICLE 대상 단건.
 * UserReportTarget.ARTICLE은 Prisma Post 모델을 가리킨다 (목록 배치 조회와 동일).
 */
export const findReportDetailTargetArticleById = async (
  id: number,
  db: DbClient = prisma
) => {
  return db.post.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      content: true,
      category: true,
      createdAt: true,
      deletedAt: true,
      user: { select: detailUserSummarySelect },
    },
  });
};

/**
 * COMMENT 대상 단건.
 * 소속 게시글 제목·삭제 여부를 함께 가져와 콘텐츠 맥락을 구성할 수 있게 한다.
 */
export const findReportDetailTargetCommentById = async (
  id: number,
  db: DbClient = prisma
) => {
  return db.comment.findUnique({
    where: { id },
    select: {
      id: true,
      content: true,
      createdAt: true,
      deletedAt: true,
      postId: true,
      user: { select: detailUserSummarySelect },
      post: {
        select: {
          id: true,
          title: true,
          deletedAt: true,
        },
      },
    },
  });
};

// --- 신고 처리: 제재 대상 사용자 조회 ---

/**
 * 정지 판단에 필요한 최소 사용자 필드.
 * admin-member의 userStatus select와 맞춰 상태·정지 기간을 한 번에 가져온다.
 */
const reportSanctionTargetUserSelect = {
  id: true,
  name: true,
  nickname: true,
  userStatus: {
    select: {
      status: true,
      suspendedAt: true,
      suspendedUntil: true,
    },
  },
} satisfies Prisma.UserSelect;

export type ReportSanctionTargetUserRow = Prisma.UserGetPayload<{
  select: typeof reportSanctionTargetUserSelect;
}>;

/**
 * 제재 대상 조회 결과.
 * HTTP 결정은 Service가 하고, Repository는 실패 원인을 구분만 한다.
 * - unsupported_target: CHAT_ROOM처럼 이 경로에서 사용자를 특정할 수 없음
 * - invalid_target_id: 형식 오류 — DB 조회 없이 조기 반환
 * - not_found: 형식은 맞지만 대상/사용자가 없음
 */
export type FindReportSanctionTargetUserResult =
  | { kind: 'found'; user: ReportSanctionTargetUserRow }
  | { kind: 'not_found' }
  | { kind: 'invalid_target_id' }
  | { kind: 'unsupported_target' };

/** USER targetId(UUID) 형식 검사 — 잘못된 값으로 Prisma가 던지는 오류를 막기 위해 조회 전에 거른다 */
const isUserTargetUuid = (targetId: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    targetId
  );

const toFoundSanctionUser = (
  user: ReportSanctionTargetUserRow | null | undefined
): FindReportSanctionTargetUserResult =>
  user ? { kind: 'found', user } : { kind: 'not_found' };

/**
 * 신고 target/targetId로 정지 대상 사용자를 조회한다.
 * 콘텐츠 대상은 관계(include)로 작성자·상태를 한 번에 가져온다.
 * 콘텐츠 soft-delete 여부와 무관하게 작성자를 찾아야 제재가 가능하므로 deletedAt 필터는 두지 않는다.
 * MESSAGE는 soft-delete 컬럼이 없고, 이 메서드는 메시지도 삭제하지 않는다.
 */
export const findReportSanctionTargetUser = async (
  target: UserReportTarget,
  targetId: string,
  db: DbClient = prisma
): Promise<FindReportSanctionTargetUserResult> => {
  // 채팅방은 참여자가 복수라 단일 제재 사용자를 정할 수 없다.
  if (target === UserReportTarget.CHAT_ROOM) {
    return { kind: 'unsupported_target' };
  }

  if (target === UserReportTarget.USER) {
    if (!isUserTargetUuid(targetId)) {
      return { kind: 'invalid_target_id' };
    }

    const user = await db.user.findUnique({
      where: { id: targetId },
      select: reportSanctionTargetUserSelect,
    });

    return toFoundSanctionUser(user);
  }

  // MESSAGE/REVIEW/ARTICLE/COMMENT의 targetId는 Int PK 문자열이다.
  const numericId = parseNumericTargetId(targetId);
  if (numericId === null) {
    return { kind: 'invalid_target_id' };
  }

  switch (target) {
    case UserReportTarget.MESSAGE: {
      const message = await db.chatMessage.findUnique({
        where: { id: numericId },
        select: {
          sender: { select: reportSanctionTargetUserSelect },
        },
      });

      return toFoundSanctionUser(message?.sender);
    }
    case UserReportTarget.REVIEW: {
      const review = await db.review.findUnique({
        where: { id: numericId },
        select: {
          user: { select: reportSanctionTargetUserSelect },
        },
      });

      return toFoundSanctionUser(review?.user);
    }
    case UserReportTarget.ARTICLE: {
      // UserReportTarget.ARTICLE → Post 모델
      const article = await db.post.findUnique({
        where: { id: numericId },
        select: {
          user: { select: reportSanctionTargetUserSelect },
        },
      });

      return toFoundSanctionUser(article?.user);
    }
    case UserReportTarget.COMMENT: {
      const comment = await db.comment.findUnique({
        where: { id: numericId },
        select: {
          user: { select: reportSanctionTargetUserSelect },
        },
      });

      return toFoundSanctionUser(comment?.user);
    }
    default:
      // 알 수 없는 enum 값은 지원하지 않는 대상으로 취급해 호출자가 분기할 수 있게 한다.
      return { kind: 'unsupported_target' };
  }
};

// --- 신고 처리: 신고 콘텐츠 조회 ---

/** REVIEW 콘텐츠 — soft-delete 후에도 상세·삭제 처리에 쓸 최소 필드 */
const reportedReviewContentSelect = {
  id: true,
  userId: true,
  rating: true,
  content: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.ReviewSelect;

/** ARTICLE(Post) 콘텐츠 — UserReportTarget.ARTICLE은 Post 모델에 대응한다 */
const reportedArticleContentSelect = {
  id: true,
  userId: true,
  category: true,
  title: true,
  content: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.PostSelect;

/** COMMENT 콘텐츠 — soft-delete 행도 포함해 관리자가 원문을 확인할 수 있게 한다 */
const reportedCommentContentSelect = {
  id: true,
  userId: true,
  postId: true,
  parentId: true,
  content: true,
  createdAt: true,
  deletedAt: true,
} satisfies Prisma.CommentSelect;

/**
 * MESSAGE 콘텐츠.
 * ChatMessage에는 deletedAt이 없고, 이번 메서드는 메시지도 삭제하지 않는다.
 */
const reportedMessageContentSelect = {
  id: true,
  senderId: true,
  roomId: true,
  messageType: true,
  content: true,
  isFiltered: true,
  createdAt: true,
} satisfies Prisma.ChatMessageSelect;

export type ReportedReviewContentRow = Prisma.ReviewGetPayload<{
  select: typeof reportedReviewContentSelect;
}>;

export type ReportedArticleContentRow = Prisma.PostGetPayload<{
  select: typeof reportedArticleContentSelect;
}>;

export type ReportedCommentContentRow = Prisma.CommentGetPayload<{
  select: typeof reportedCommentContentSelect;
}>;

export type ReportedMessageContentRow = Prisma.ChatMessageGetPayload<{
  select: typeof reportedMessageContentSelect;
}>;

/**
 * 신고 콘텐츠 조회 결과.
 * HTTP는 Service가 결정하고, Repository는 대상별 데이터·실패 원인만 구분한다.
 * invalid_target_id는 요청 검증 오류가 아니라 저장된 신고 targetId 형식 이상일 수 있다.
 */
export type FindReportReportedContentResult =
  | { kind: 'review'; content: ReportedReviewContentRow }
  | { kind: 'article'; content: ReportedArticleContentRow }
  | { kind: 'comment'; content: ReportedCommentContentRow }
  | { kind: 'message'; content: ReportedMessageContentRow }
  | { kind: 'no_content' }
  | { kind: 'not_found' }
  | { kind: 'invalid_target_id' }
  | { kind: 'unsupported_target' };

/**
 * 신고 target/targetId로 신고된 콘텐츠를 조회한다.
 * 상세 화면의 콘텐츠 영역과 이후 soft-delete Action이 같은 계약을 쓰도록 최소 필드를 고정한다.
 * deletedAt 필터를 두지 않아 이미 삭제된 콘텐츠도 반환한다.
 */
export const findReportReportedContent = async (
  target: UserReportTarget,
  targetId: string,
  db: DbClient = prisma
): Promise<FindReportReportedContentResult> => {
  // USER 신고는 별도 콘텐츠 row가 없다 — 프로필은 사용자 조회 경로를 쓴다.
  if (target === UserReportTarget.USER) {
    return { kind: 'no_content' };
  }

  // CHAT_ROOM은 이번 콘텐츠 조회 범위에서 제외한다.
  if (target === UserReportTarget.CHAT_ROOM) {
    return { kind: 'unsupported_target' };
  }

  const numericId = parseNumericTargetId(targetId);
  if (numericId === null) {
    return { kind: 'invalid_target_id' };
  }

  switch (target) {
    case UserReportTarget.REVIEW: {
      const content = await db.review.findUnique({
        where: { id: numericId },
        select: reportedReviewContentSelect,
      });

      return content
        ? { kind: 'review', content }
        : { kind: 'not_found' };
    }
    case UserReportTarget.ARTICLE: {
      const content = await db.post.findUnique({
        where: { id: numericId },
        select: reportedArticleContentSelect,
      });

      return content
        ? { kind: 'article', content }
        : { kind: 'not_found' };
    }
    case UserReportTarget.COMMENT: {
      const content = await db.comment.findUnique({
        where: { id: numericId },
        select: reportedCommentContentSelect,
      });

      return content
        ? { kind: 'comment', content }
        : { kind: 'not_found' };
    }
    case UserReportTarget.MESSAGE: {
      const content = await db.chatMessage.findUnique({
        where: { id: numericId },
        select: reportedMessageContentSelect,
      });

      return content
        ? { kind: 'message', content }
        : { kind: 'not_found' };
    }
    default:
      return { kind: 'unsupported_target' };
  }
};

// --- 신고 처리: 신고 콘텐츠 soft delete ---

/** soft delete 가능한 신고 콘텐츠 대상 */
export type SoftDeletableReportTarget =
  | typeof UserReportTarget.REVIEW
  | typeof UserReportTarget.ARTICLE
  | typeof UserReportTarget.COMMENT;

/**
 * 신고 콘텐츠 soft delete 결과.
 * HTTP는 Service가 결정하고, 이미 삭제됨/미존재/형식 오류를 Repository에서 구분한다.
 */
export type SoftDeleteReportReportedContentResult =
  | {
      kind: 'deleted';
      target: SoftDeletableReportTarget;
      id: number;
    }
  | {
      kind: 'already_deleted';
      target: SoftDeletableReportTarget;
      id: number;
    }
  | { kind: 'not_found' }
  | { kind: 'invalid_target_id' }
  | { kind: 'unsupported_target' };

/**
 * 조건부 soft delete가 0건일 때 미존재/이미 삭제를 구분한다.
 * updateMany(count=0)만으로는 원인을 알 수 없어 한 번 더 조회한다.
 */
const resolveSoftDeleteMiss = async (
  target: SoftDeletableReportTarget,
  id: number,
  deletedAt: Date | null | undefined
): Promise<SoftDeleteReportReportedContentResult> => {
  if (deletedAt === undefined) {
    return { kind: 'not_found' };
  }

  if (deletedAt !== null) {
    return { kind: 'already_deleted', target, id };
  }

  // 행은 있는데 deletedAt이 null인데도 updateMany가 0이면 경합으로 직후 삭제된 경우다.
  return { kind: 'already_deleted', target, id };
};

const softDeleteReviewContent = async (
  id: number,
  deletedAt: Date,
  db: DbClient
): Promise<SoftDeleteReportReportedContentResult> => {
  // id + deletedAt IS NULL 조건부 갱신으로 동시 삭제 시 한 요청만 성공하게 한다.
  const updateResult = await db.review.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt },
  });

  if (updateResult.count === 1) {
    return {
      kind: 'deleted',
      target: UserReportTarget.REVIEW,
      id,
    };
  }

  const review = await db.review.findUnique({
    where: { id },
    select: { id: true, deletedAt: true },
  });

  return resolveSoftDeleteMiss(
    UserReportTarget.REVIEW,
    id,
    review?.deletedAt
  );
};

const softDeleteArticleContent = async (
  id: number,
  deletedAt: Date,
  db: DbClient
): Promise<SoftDeleteReportReportedContentResult> => {
  const updateResult = await db.post.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt },
  });

  if (updateResult.count === 1) {
    return {
      kind: 'deleted',
      target: UserReportTarget.ARTICLE,
      id,
    };
  }

  const article = await db.post.findUnique({
    where: { id },
    select: { id: true, deletedAt: true },
  });

  return resolveSoftDeleteMiss(
    UserReportTarget.ARTICLE,
    id,
    article?.deletedAt
  );
};

/**
 * 신고된 댓글 soft delete — 사용자 softDeleteComment와 동일하게
 * 부모 + 활성 직계 대댓글을 함께 지우고, 실제 삭제 수만큼 commentCount를 줄인다.
 * 자체 트랜잭션은 열지 않고 전달받은 db·deletedAt만 사용한다.
 */
const softDeleteCommentContent = async (
  id: number,
  deletedAt: Date,
  db: DbClient
): Promise<SoftDeleteReportReportedContentResult> => {
  // postId는 요청값이 아니라 DB 행에서 가져온다.
  const comment = await db.comment.findUnique({
    where: { id },
    select: { id: true, postId: true, deletedAt: true },
  });

  if (!comment) {
    return { kind: 'not_found' };
  }

  // 부모가 이미 삭제됐으면 대댓글만 따로 지우지 않고 already_deleted로 끝낸다.
  if (comment.deletedAt !== null) {
    return {
      kind: 'already_deleted',
      target: UserReportTarget.COMMENT,
      id: comment.id,
    };
  }

  const deleteResult = await db.comment.updateMany({
    where: {
      postId: comment.postId,
      deletedAt: null,
      OR: [{ id: comment.id }, { parentId: comment.id }],
    },
    data: { deletedAt },
  });

  // 경합으로 조건부 갱신이 0건이면 카운트를 건드리지 않는다.
  if (deleteResult.count === 0) {
    return {
      kind: 'already_deleted',
      target: UserReportTarget.COMMENT,
      id: comment.id,
    };
  }

  await db.post.updateMany({
    where: { id: comment.postId, deletedAt: null },
    data: { commentCount: { decrement: deleteResult.count } },
  });

  return {
    kind: 'deleted',
    target: UserReportTarget.COMMENT,
    id: comment.id,
  };
};

/**
 * 신고 target/targetId로 REVIEW·ARTICLE·COMMENT를 soft delete한다.
 * 작성자 권한 검사는 하지 않는다 — 관리자 신고 처리 전용.
 * MESSAGE/USER/CHAT_ROOM은 unsupported_target.
 * deletedAt은 Service가 넘긴 처리 시각을 그대로 쓴다.
 */
export const softDeleteReportReportedContent = async (
  target: UserReportTarget,
  targetId: string,
  deletedAt: Date,
  db: DbClient = prisma
): Promise<SoftDeleteReportReportedContentResult> => {
  if (
    target === UserReportTarget.USER ||
    target === UserReportTarget.MESSAGE ||
    target === UserReportTarget.CHAT_ROOM
  ) {
    return { kind: 'unsupported_target' };
  }

  const numericId = parseNumericTargetId(targetId);
  if (numericId === null) {
    return { kind: 'invalid_target_id' };
  }

  switch (target) {
    case UserReportTarget.REVIEW:
      return softDeleteReviewContent(numericId, deletedAt, db);
    case UserReportTarget.ARTICLE:
      return softDeleteArticleContent(numericId, deletedAt, db);
    case UserReportTarget.COMMENT:
      return softDeleteCommentContent(numericId, deletedAt, db);
    default:
      return { kind: 'unsupported_target' };
  }
};
