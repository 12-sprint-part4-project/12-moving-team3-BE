import {
  HistoryAction,
  Prisma,
  QuoteStatus,
  UserReportTarget,
  UserStatus,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import type { AdminMemberListQuery } from '../schemas/admin-member.schema';
import { createDateRange } from '../utils/admin-date-range.util';

/** History.tableName — UserStatusInfo @@map("user_statuses")와 동일하게 맞춘다 */
const USER_STATUS_TABLE_NAME = 'user_statuses';

/** History before/after에 남길 UserStatusInfo 스냅샷 필드 */
const adminMemberStatusSelect = {
  userId: true,
  status: true,
  suspendedAt: true,
  suspendedUntil: true,
} satisfies Prisma.UserStatusInfoSelect;

/** 관리자 회원 목록 select — DTO 매핑에 필요한 필드만 조회 */
const adminMemberListSelect = {
  id: true,
  name: true,
  nickname: true,
  email: true,
  phoneNumber: true,
  userType: true,
  createdAt: true,
  userStatus: {
    select: {
      status: true,
      suspendedAt: true,
      suspendedUntil: true,
    },
  },
} satisfies Prisma.UserSelect;

export type AdminMemberListRow = Prisma.UserGetPayload<{
  select: typeof adminMemberListSelect;
}>;

/** 관리자 회원 상세 select — 기본 정보 + 유형별 프로필 + 계정 상태 */
const adminMemberDetailSelect = {
  id: true,
  name: true,
  nickname: true,
  email: true,
  phoneNumber: true,
  profileImageKey: true,
  userType: true,
  createdAt: true,
  userStatus: {
    select: {
      status: true,
      suspendedAt: true,
      suspendedUntil: true,
    },
  },
  customerProfile: {
    select: {
      id: true,
      region: true,
      service: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  moverProfile: {
    select: {
      id: true,
      service: true,
      career: true,
      shortDescription: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      serviceRegions: {
        select: {
          region: true,
        },
      },
    },
  },
} satisfies Prisma.UserSelect;

export type AdminMemberDetailRow = Prisma.UserGetPayload<{
  select: typeof adminMemberDetailSelect;
}>;

/**
 * 목록/카운트에 공통으로 쓰는 where.
 * Service는 관계 부재를 ACTIVE로 정규화하므로,
 * status=ACTIVE 필터도 관계가 없는 회원을 함께 포함해야 목록/필터가 모순되지 않는다.
 */
const buildAdminMemberListWhere = (
  params: Pick<
    AdminMemberListQuery,
    'userType' | 'status' | 'search' | 'startDate' | 'endDate'
  >
): Prisma.UserWhereInput => {
  // 통계 API와 동일: startDate가 없으면 기간 필터를 두지 않는다.
  const dateRange = createDateRange(params.startDate, params.endDate);

  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...(dateRange && { createdAt: dateRange }),
  };

  if (params.userType) {
    where.userType = params.userType;
  }

  // search OR와 status OR가 섞이지 않도록 AND로 묶는다.
  const andConditions: Prisma.UserWhereInput[] = [];

  if (params.status === UserStatus.ACTIVE) {
    andConditions.push({
      OR: [
        { userStatus: { is: null } },
        { userStatus: { is: { status: UserStatus.ACTIVE } } },
      ],
    });
  } else if (params.status) {
    andConditions.push({
      userStatus: {
        is: {
          status: params.status,
        },
      },
    });
  }

  if (params.search) {
    andConditions.push({
      OR: [
        { name: { contains: params.search, mode: 'insensitive' } },
        { nickname: { contains: params.search, mode: 'insensitive' } },
        { email: { contains: params.search, mode: 'insensitive' } },
        { phoneNumber: { contains: params.search, mode: 'insensitive' } },
      ],
    });
  }

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  return where;
};

/** 관리자 회원 목록 + 전체 건수 조회 (totalPages는 Service에서 계산) */
export const findAdminMembersWithCount = async (
  params: AdminMemberListQuery
): Promise<{ items: AdminMemberListRow[]; totalCount: number }> => {
  const where = buildAdminMemberListWhere(params);
  const skip = (params.page - 1) * params.pageSize;

  const [items, totalCount] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select: adminMemberListSelect,
      // createdAt이 같으면 id로 tie-break해 offset 페이지네이션 순서를 안정화한다.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take: params.pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return { items, totalCount };
};

/** 관리자 회원 상세 조회 (삭제되지 않은 회원만) */
export const findAdminMemberDetail = async (
  memberId: string
): Promise<AdminMemberDetailRow | null> => {
  return prisma.user.findFirst({
    where: {
      id: memberId,
      deletedAt: null,
    },
    select: adminMemberDetailSelect,
  });
};

/**
 * 상태 변경 전 회원 존재 확인용 — 상세 select 없이 id만 조회한다.
 * 없거나 삭제된 회원이면 null을 반환해 Service에서 ADMIN_MEMBER_NOT_FOUND로 처리한다.
 */
export const findAdminMemberId = async (
  memberId: string
): Promise<string | null> => {
  const member = await prisma.user.findFirst({
    where: {
      id: memberId,
      deletedAt: null,
    },
    select: { id: true },
  });

  return member?.id ?? null;
};

/** UserStatusInfo upsert 결과 — 상태 변경 API 응답·History 스냅샷에 필요한 필드만 */
export type AdminMemberStatusRow = {
  userId: string;
  status: UserStatus;
  suspendedAt: Date | null;
  suspendedUntil: Date | null;
};

export type UpdateAdminMemberStatusWithHistoryParams = {
  memberId: string;
  adminId: number;
  status: UserStatus;
  suspendedAt: Date | null;
  suspendedUntil: Date | null;
};

/**
 * History Json 컬럼용 스냅샷.
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

/**
 * UserStatusInfo upsert와 History 저장을 한 트랜잭션으로 처리한다.
 * 한쪽만 성공하면 감사 추적과 실제 상태가 어긋나므로 반드시 함께 커밋/롤백한다.
 */
export const updateAdminMemberStatusWithHistory = async (
  params: UpdateAdminMemberStatusWithHistoryParams
): Promise<AdminMemberStatusRow> => {
  const { memberId, adminId, status, suspendedAt, suspendedUntil } = params;

  return prisma.$transaction(async (tx) => {
    // row가 없으면 beforeData를 null로 남겨 "최초 상태 생성" 이력을 구분한다.
    const beforeData = await tx.userStatusInfo.findUnique({
      where: { userId: memberId },
      select: adminMemberStatusSelect,
    });

    const afterData = await tx.userStatusInfo.upsert({
      where: { userId: memberId },
      create: {
        userId: memberId,
        status,
        suspendedAt,
        suspendedUntil,
      },
      update: {
        status,
        suspendedAt,
        suspendedUntil,
      },
      select: adminMemberStatusSelect,
    });

    // 관리자 작업이므로 actor는 adminUserId에 두고, 대상 회원은 tableRowId로 식별한다.
    await tx.history.create({
      data: {
        userId: null,
        adminUserId: adminId,
        tableName: USER_STATUS_TABLE_NAME,
        tableRowId: memberId,
        operationType: HistoryAction.UPDATE,
        beforeData: toStatusHistoryJson(beforeData),
        afterData: toStatusHistoryJson(afterData),
      },
    });

    return afterData;
  });
};

/** 해당 회원(target=USER)을 대상으로 한 신고 건수 */
export const countAdminMemberReports = async (
  memberId: string
): Promise<number> => {
  // UserReport.targetId는 폴리모픽이라 User 관계(_count)로 집계할 수 없다.
  return prisma.userReport.count({
    where: {
      target: UserReportTarget.USER,
      targetId: memberId,
    },
  });
};

/** 기사의 CONFIRMED 견적(완료 건) 수 */
export const countConfirmedQuotesByMoverId = async (
  moverId: string
): Promise<number> => {
  return prisma.quote.count({
    where: {
      moverId,
      status: QuoteStatus.CONFIRMED,
      deletedAt: null,
    },
  });
};
