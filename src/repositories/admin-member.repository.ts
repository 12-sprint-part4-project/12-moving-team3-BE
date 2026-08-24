import { Prisma, QuoteStatus, UserStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import type { AdminMemberListQuery } from '../schemas/admin-member.schema';
import { createDateRange } from '../utils/admin-date-range.util';

type DbClient = typeof prisma | Prisma.TransactionClient;

/**
 * user_reports.target_id(VarChar) → 콘텐츠 Int PK 안전 변환.
 * 잘못된 숫자 문자열에서 ::integer cast 오류가 나지 않도록
 * 정규식 통과 후에만 안쪽 CASE에서 bigint/integer cast를 수행한다.
 * (같은 WHEN의 AND는 평가 순서가 보장되지 않으므로 중첩 CASE를 쓴다)
 */
const safeReportContentIdSql = Prisma.sql`
  CASE
    WHEN ur.target_id ~ '^[1-9][0-9]{0,9}$'
    THEN CASE
      WHEN ur.target_id::bigint <= 2147483647
      THEN ur.target_id::integer
      ELSE NULL
    END
    ELSE NULL
  END
`;

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
export const buildAdminMemberListWhere = (
  params: Pick<
    AdminMemberListQuery,
    | 'userType'
    | 'status'
    | 'userName'
    | 'email'
    | 'phoneNumber'
    | 'startDate'
    | 'endDate'
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

  // 상태 OR와 검색 조건이 섞이지 않도록 AND로 묶는다.
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

  if (params.userName) {
    andConditions.push({
      OR: [
        { name: { contains: params.userName, mode: 'insensitive' } },
        { nickname: { contains: params.userName, mode: 'insensitive' } },
      ],
    });
  }

  if (params.email) {
    andConditions.push({
      email: { contains: params.email, mode: 'insensitive' },
    });
  }

  const normalizedPhoneNumber = params.phoneNumber?.replace(/\D/g, '');
  if (normalizedPhoneNumber) {
    andConditions.push({
      phoneNumber: { contains: normalizedPhoneNumber },
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
      // createdAt이 같으면 id desc로 tie-break해 offset 페이지네이션 순서를 안정화한다.
      // 날짜만 뒤집고 id는 고정해 견적 요청 목록과 같은 보조 정렬을 유지한다.
      orderBy:
        params.sort === 'ASC'
          ? [{ createdAt: 'asc' }, { id: 'desc' }]
          : [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take: params.pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return { items, totalCount };
};

/** 목록 필터·정렬 기준 인접 건 조회. id만 필요하므로 select를 최소로 둔다. */
export const findAdminMemberFirst = async (
  where: Prisma.UserWhereInput,
  orderBy: Prisma.UserOrderByWithRelationInput[]
): Promise<{ id: string } | null> => {
  return prisma.user.findFirst({
    where,
    orderBy,
    select: { id: true },
  });
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

/** UserStatusInfo 조회/upsert 결과 — 상태 변경 API 응답·History 스냅샷에 필요한 필드만 */
export interface AdminMemberStatusRow {
  userId: string;
  status: UserStatus;
  suspendedAt: Date | null;
  suspendedUntil: Date | null;
}

/** 회원 계정 상태 변경 입력 */
export interface AdminMemberStatusUpdate {
  status: UserStatus;
  suspendedAt: Date | null;
  suspendedUntil: Date | null;
}

/**
 * 상태 변경 대상 회원 row를 FOR UPDATE로 잠근다.
 * soft delete와 상태 변경이 겹치지 않도록 트랜잭션 안에서만 호출한다.
 */
export const lockAdminMemberForStatusChange = async (
  memberId: string,
  tx: Prisma.TransactionClient
): Promise<{ id: string } | null> => {
  const lockedMembers = await tx.$queryRaw<{ id: string }[]>`
    SELECT id
    FROM users
    WHERE id = ${memberId}::uuid
      AND deleted_at IS NULL
    FOR UPDATE
  `;

  return lockedMembers[0] ?? null;
};

/** 변경 전 UserStatusInfo 조회 — row가 없으면 null */
export const findAdminMemberStatus = async (
  memberId: string,
  db: DbClient = prisma
): Promise<AdminMemberStatusRow | null> => {
  return db.userStatusInfo.findUnique({
    where: { userId: memberId },
    select: adminMemberStatusSelect,
  });
};

/**
 * 회원 계정 상태 upsert.
 * UserStatusInfo row가 없는 회원도 첫 정지/활성화 시 row를 생성해야 하므로 upsert를 쓴다.
 */
export const upsertAdminMemberStatus = async (
  memberId: string,
  data: AdminMemberStatusUpdate,
  db: DbClient = prisma
): Promise<AdminMemberStatusRow> => {
  return db.userStatusInfo.upsert({
    where: { userId: memberId },
    create: {
      userId: memberId,
      status: data.status,
      suspendedAt: data.suspendedAt,
      suspendedUntil: data.suspendedUntil,
    },
    update: {
      status: data.status,
      suspendedAt: data.suspendedAt,
      suspendedUntil: data.suspendedUntil,
    },
    select: adminMemberStatusSelect,
  });
};

/**
 * 해당 회원이 직접 또는 작성 콘텐츠를 통해 받은 신고 누적 건수.
 * reporterId(신고한 횟수)가 아니라 신고받은 횟수이며, 상태 필터 없이 전체 이력을 센다.
 * USER 직접 신고 + REVIEW/ARTICLE/COMMENT/MESSAGE 작성자 신고를 한 번의 COUNT로 집계한다.
 * soft-delete된 사용자·콘텐츠의 신고도 포함하며, CHAT_ROOM은 enum에서 제거되어 제외한다.
 * DbClient를 받아 트랜잭션·신고 상세 조회와 같은 클라이언트를 쓸 수 있게 한다.
 */
export const countAdminMemberReports = async (
  memberId: string,
  db: DbClient = prisma
): Promise<number> => {
  // targetId가 폴리모픽이라 Prisma _count/관계 집계로 표현할 수 없다.
  // memberId는 파라미터 바인딩만 사용하고 SQL 문자열에 이어붙이지 않는다.
  const rows = await db.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS count
    FROM user_reports ur
    WHERE
      (
        ur.target = 'USER'::"UserReportTarget"
        AND ur.target_id = ${memberId}
      )
      OR (
        ur.target = 'REVIEW'::"UserReportTarget"
        AND EXISTS (
          SELECT 1
          FROM reviews r
          WHERE r.id = (${safeReportContentIdSql})
            AND r.user_id = ${memberId}::uuid
        )
      )
      OR (
        ur.target = 'ARTICLE'::"UserReportTarget"
        AND EXISTS (
          SELECT 1
          FROM posts p
          WHERE p.id = (${safeReportContentIdSql})
            AND p.user_id = ${memberId}::uuid
        )
      )
      OR (
        ur.target = 'COMMENT'::"UserReportTarget"
        AND EXISTS (
          SELECT 1
          FROM comments c
          WHERE c.id = (${safeReportContentIdSql})
            AND c.user_id = ${memberId}::uuid
        )
      )
      OR (
        ur.target = 'MESSAGE'::"UserReportTarget"
        AND EXISTS (
          SELECT 1
          FROM chat_messages m
          WHERE m.id = (${safeReportContentIdSql})
            AND m.sender_id = ${memberId}::uuid
        )
      )
  `;

  return rows[0]?.count ?? 0;
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
