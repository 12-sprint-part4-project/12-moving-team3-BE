import { UserStatus, UserType } from '@prisma/client';
import type {
  AdminMemberListItemDto,
  AdminMemberListResultDto,
} from '../dtos/admin-member.dto';
import {
  findAdminMemberDetail,
  findAdminMembersWithCount,
  type AdminMemberDetailRow,
  type AdminMemberListRow,
} from '../repositories/admin-member.repository';
import reviewRepository from '../repositories/review.repository';
import type { AdminMemberListQuery } from '../schemas/admin-member.schema';
import { AppError } from '../utils/app.error';

/**
 * Repository row → 목록 아이템 DTO.
 * userStatus 관계가 없으면 스키마 기본값(ACTIVE)과 동일하게 정규화하고,
 * 정지 시각은 관계가 없으므로 null을 유지한다.
 */
const toAdminMemberListItem = (
  row: AdminMemberListRow,
  averageRating: number | null
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
  averageRating,
});

/** 관리자 회원 목록 조회 */
export const getAdminMemberList = async (
  params: AdminMemberListQuery
): Promise<AdminMemberListResultDto> => {
  const { items, totalCount } = await findAdminMembersWithCount(params);

  // 기사 관리 목록의 평점 컬럼용 — 페이지 내 MOVER만 배치 집계한다.
  const moverIds = items
    .filter((item) => item.userType === UserType.MOVER)
    .map((item) => item.id);
  const reviewStatsByMoverId =
    await reviewRepository.getReviewStatsByMoverIds(moverIds);

  return {
    items: items.map((row) =>
      toAdminMemberListItem(
        row,
        row.userType === UserType.MOVER
          ? (reviewStatsByMoverId.get(row.id)?.averageRating ?? null)
          : null
      )
    ),
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      totalCount,
      totalPages: Math.ceil(totalCount / params.pageSize),
    },
  };
};

/** 관리자 회원 상세 조회 */
export const getAdminMemberDetail = async (
  memberId: string
): Promise<AdminMemberDetailRow> => {
  const member = await findAdminMemberDetail(memberId);

  // 없거나 삭제된 회원은 Repository에서 null이므로 관리자 상세 조회 404로 처리한다.
  if (!member) {
    throw new AppError('ADMIN_MEMBER_NOT_FOUND');
  }

  return member;
};
