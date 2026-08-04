import { HistoryAction, Prisma, UserStatus, UserType } from '@prisma/client';
import type {
  AdminMemberListItemDto,
  AdminMemberListResultDto,
  AdminMemberStatusResultDto,
} from '../dtos/admin-member.dto';
import { prisma } from '../lib/prisma';
import {
  countAdminMemberReports,
  countConfirmedQuotesByMoverId,
  findAdminMemberDetail,
  findAdminMemberStatus,
  findAdminMembersWithCount,
  lockAdminMemberForStatusChange,
  upsertAdminMemberStatus,
  type AdminMemberDetailRow,
  type AdminMemberListRow,
  type AdminMemberStatusRow,
  type AdminMemberStatusUpdate,
} from '../repositories/admin-member.repository';
import { createHistory } from '../repositories/history.repository';
import reviewRepository from '../repositories/review.repository';
import type { AdminMemberListQuery } from '../schemas/admin-member.schema';
import { AppError } from '../utils/app.error';

/** 관리자 수동 정지 기간 — 정책상 7일 고정 */
const ADMIN_SUSPEND_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

/** History.tableName — UserStatusInfo @@map("user_statuses")와 동일하게 맞춘다 */
const USER_STATUS_TABLE_NAME = 'user_statuses';

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

const toAdminMemberStatusResult = (
  row: AdminMemberStatusRow
): AdminMemberStatusResultDto => ({
  memberId: row.userId,
  status: row.status,
  suspendedAt: row.suspendedAt,
  suspendedUntil: row.suspendedUntil,
});

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
 * 존재 확인·상태 변경·History를 한 트랜잭션으로 처리한다.
 * 에러 코드 결정은 Service 책임이며, Repository는 조회/잠금/저장만 수행한다.
 */
const changeAdminMemberStatus = async (
  memberId: string,
  adminId: number,
  data: AdminMemberStatusUpdate
): Promise<AdminMemberStatusResultDto> => {
  const statusInfo = await prisma.$transaction(async (tx) => {
    // soft delete와 상태 변경 race를 막기 위해 회원 row를 먼저 잠근다.
    const member = await lockAdminMemberForStatusChange(memberId, tx);

    if (!member) {
      throw new AppError('ADMIN_MEMBER_NOT_FOUND');
    }

    // row가 없으면 beforeData를 null로 남겨 "최초 상태 생성" 이력을 구분한다.
    const beforeData = await findAdminMemberStatus(memberId, tx);
    const afterData = await upsertAdminMemberStatus(memberId, data, tx);

    // 최초 row 생성은 CREATE, 기존 row 갱신은 UPDATE로 남겨 감사 의미를 맞춘다.
    const operationType =
      beforeData === null ? HistoryAction.CREATE : HistoryAction.UPDATE;

    // 관리자 작업이므로 actor는 adminUserId에 두고, 대상 회원은 tableRowId로 식별한다.
    await createHistory(
      {
        userId: null,
        adminUserId: adminId,
        tableName: USER_STATUS_TABLE_NAME,
        tableRowId: memberId,
        operationType,
        beforeData: toStatusHistoryJson(beforeData),
        afterData: toStatusHistoryJson(afterData),
      },
      tx
    );

    return afterData;
  });

  return toAdminMemberStatusResult(statusInfo);
};

/** 관리자 회원 7일 정지 */
export const suspendAdminMember = async (
  memberId: string,
  adminId: number
): Promise<AdminMemberStatusResultDto> => {
  const now = new Date();

  return changeAdminMemberStatus(memberId, adminId, {
    status: UserStatus.SUSPENDED,
    suspendedAt: now,
    // 정지 종료 시각을 서버 기준으로 고정해 클라이언트 시계 편차를 피한다.
    suspendedUntil: new Date(now.getTime() + ADMIN_SUSPEND_DURATION_MS),
  });
};

/**
 * 관리자 회원 활성화.
 * 정지 시각을 null로 비워 ACTIVE와 함께 상태가 일관되게 보이도록 한다.
 */
export const activateAdminMember = async (
  memberId: string,
  adminId: number
): Promise<AdminMemberStatusResultDto> => {
  return changeAdminMemberStatus(memberId, adminId, {
    status: UserStatus.ACTIVE,
    suspendedAt: null,
    suspendedUntil: null,
  });
};
