import { UserStatus, UserType } from '@prisma/client';
import { z } from 'zod';
import { listQuerySchema } from './admin-list-query.schema';
import { adminStatisticsFilterSchema } from './admin-statistics.schema';

/** 관리자 회원 목록 조회 Query 스키마 */
export const adminMemberListQuerySchema = listQuerySchema
  .extend({
    // User.userType과 동일한 Prisma enum만 허용해 잘못된 필터 값이 DB 조회까지 내려가지 않게 한다.
    userType: z.enum(UserType).optional(),
    // UserStatusInfo.status와 동일한 Prisma enum만 허용해 상태 필터 의미를 스키마와 일치시킨다.
    status: z.enum(UserStatus).optional(),
    // 가입일 정렬은 허용된 두 방향만 받고, 기존 동작과 동일하게 최신순을 기본값으로 둔다.
    sortOrder: z.enum(['ASC', 'DESC']).optional().default('DESC'),
  })
  // 가입 기간은 statistics와 동일한 startDate/endDate 검증 정책을 재사용한다.
  .and(adminStatisticsFilterSchema);

export type AdminMemberListQuery = z.infer<typeof adminMemberListQuerySchema>;

/** 관리자 회원 상세 조회 Path Params — User.id(@db.Uuid)와 동일한 UUID 형식만 허용 */
export const adminMemberDetailParamsSchema = z.object({
  memberId: z.uuid(),
});

export type AdminMemberDetailParams = z.infer<
  typeof adminMemberDetailParamsSchema
>;

/** 회원 상태 변경(정지/활성화) Path Params — 상세 조회와 동일한 UUID 검증을 재사용한다 */
export const adminMemberStatusParamsSchema = adminMemberDetailParamsSchema;

export type AdminMemberStatusParams = z.infer<
  typeof adminMemberStatusParamsSchema
>;
