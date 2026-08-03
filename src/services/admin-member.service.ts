import { UserStatus, UserType } from '@prisma/client';
import type {
  AdminMemberListItemDto,
  AdminMemberListResultDto,
} from '../dtos/admin-member.dto';
import {
  countAdminMemberReports,
  countConfirmedQuotesByMoverId,
  findAdminMemberDetail,
  findAdminMembersWithCount,
  type AdminMemberDetailRow,
  type AdminMemberListRow,
} from '../repositories/admin-member.repository';
import reviewRepository from '../repositories/review.repository';
import type { AdminMemberListQuery } from '../schemas/admin-member.schema';
import { AppError } from '../utils/app.error';

/** 관리자 회원 상세 응답 — Repository row + Service에서 조합한 집계 필드 */
export type AdminMemberDetailResult = AdminMemberDetailRow & {
  reportCount: number;
  averageRating: number | null;
  reviewCount: number;
  confirmedQuoteCount: number;
};

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

/**
 * 관리자 회원 상세 조회.
 * movers.service.getMoverDetail와 같이 Repository 조회 후 Service에서 집계를 조합한다.
 */
export const getAdminMemberDetail = async (
  memberId: string
): Promise<AdminMemberDetailResult> => {
  const member = await findAdminMemberDetail(memberId);

  // 없거나 삭제된 회원은 Repository에서 null이므로 관리자 상세 조회 404로 처리한다.
  if (!member) {
    throw new AppError('ADMIN_MEMBER_NOT_FOUND');
  }

  const isMover = member.userType === UserType.MOVER;

  const [reportCount, reviewStats, confirmedQuoteCount] = await Promise.all([
    countAdminMemberReports(memberId),
    isMover
      ? reviewRepository.getReviewStatsByMoverId(memberId)
      : Promise.resolve(null),
    isMover
      ? countConfirmedQuotesByMoverId(memberId)
      : Promise.resolve(0),
  ]);

  return {
    ...member,
    reportCount,
    averageRating: reviewStats?.averageRating ?? null,
    reviewCount: reviewStats?.totalCount ?? 0,
    confirmedQuoteCount,
  };
};

/**
 * 관리자 회원 정지 stub.
 * 다음 작업에서 UserStatusInfo 업데이트·History 저장을 구현한다.
 * 지금은 라우트/컨트롤러 연결용으로 상세 조회 결과만 반환한다.
 */
export const suspendAdminMember = async (
  memberId: string,
  _adminId: number
): Promise<AdminMemberDetailResult> => {
  return getAdminMemberDetail(memberId);
};

/**
 * 관리자 회원 활성화 stub.
 * 다음 작업에서 UserStatusInfo 업데이트·History 저장을 구현한다.
 * 지금은 라우트/컨트롤러 연결용으로 상세 조회 결과만 반환한다.
 */
export const activateAdminMember = async (
  memberId: string,
  _adminId: number
): Promise<AdminMemberDetailResult> => {
  return getAdminMemberDetail(memberId);
};
