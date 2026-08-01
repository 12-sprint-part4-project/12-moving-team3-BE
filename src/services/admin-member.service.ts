import { UserStatus } from '@prisma/client';
import type {
  AdminMemberListItemDto,
  AdminMemberListResultDto,
} from '../dtos/admin-member.dto';
import {
  findAdminMembersWithCount,
  type AdminMemberListRow,
} from '../repositories/admin-member.repository';
import type { AdminMemberListQuery } from '../schemas/admin-member.schema';

/**
 * Repository row → 목록 아이템 DTO.
 * userStatus 관계가 없으면 스키마 기본값(ACTIVE)과 동일하게 정규화하고,
 * 정지 시각은 관계가 없으므로 null을 유지한다.
 */
const toAdminMemberListItem = (
  row: AdminMemberListRow
): AdminMemberListItemDto => ({
  id: row.id,
  name: row.name,
  nickname: row.nickname,
  email: row.email,
  phoneNumber: row.phoneNumber,
  userType: row.userType,
  status: row.userStatus?.status ?? UserStatus.ACTIVE,
  suspendedAt: row.userStatus?.suspendedAt ?? null,
  suspendedUntil: row.userStatus?.suspendedUntil ?? null,
  createdAt: row.createdAt,
});

/** 관리자 회원 목록 조회 */
export const getAdminMemberList = async (
  params: AdminMemberListQuery
): Promise<AdminMemberListResultDto> => {
  const { items, totalCount } = await findAdminMembersWithCount(params);

  return {
    items: items.map(toAdminMemberListItem),
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      totalCount,
      totalPages: Math.ceil(totalCount / params.pageSize),
    },
  };
};
