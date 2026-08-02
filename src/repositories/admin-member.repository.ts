import { Prisma, UserStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import type { AdminMemberListQuery } from '../schemas/admin-member.schema';
import { createDateRange } from '../utils/admin-date-range.util';

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
