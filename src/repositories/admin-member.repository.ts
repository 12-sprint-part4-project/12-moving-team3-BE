import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import type { AdminMemberListQuery } from '../schemas/admin-member.schema';

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

/**
 * 목록/카운트에 공통으로 쓰는 where.
 * status 필터는 userStatus 관계가 있는 행만 매칭하며,
 * 관계 부재를 ACTIVE로 간주하지 않는다(해당 정책은 Service에서 결정).
 */
const buildAdminMemberListWhere = (
  params: Pick<AdminMemberListQuery, 'userType' | 'status' | 'search'>
): Prisma.UserWhereInput => {
  const where: Prisma.UserWhereInput = {
    deletedAt: null,
  };

  if (params.userType) {
    where.userType = params.userType;
  }

  // status가 있을 때만 관계 내부 값으로 필터한다.
  // is 조건을 쓰면 관계가 없는 회원은 자연히 제외되어, ACTIVE 기본값 추론을 Repo에서 하지 않게 된다.
  if (params.status) {
    where.userStatus = {
      is: {
        status: params.status,
      },
    };
  }

  if (params.search) {
    where.OR = [
      { name: { contains: params.search, mode: 'insensitive' } },
      { nickname: { contains: params.search, mode: 'insensitive' } },
      { email: { contains: params.search, mode: 'insensitive' } },
      { phoneNumber: { contains: params.search, mode: 'insensitive' } },
    ];
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
      orderBy: { createdAt: 'desc' },
      skip,
      take: params.pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return { items, totalCount };
};
