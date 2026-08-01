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
  })
  // 가입 기간은 statistics와 동일한 startDate/endDate 검증 정책을 재사용한다.
  .and(adminStatisticsFilterSchema);

export type AdminMemberListQuery = z.infer<typeof adminMemberListQuerySchema>;

/** 관리자 회원 상세 조회 Path Params 스키마 (실제 검증은 이후 구현) */
export const adminMemberDetailParamsSchema = z.object({
  memberId: z.string(),
});

export type AdminMemberDetailParams = z.infer<
  typeof adminMemberDetailParamsSchema
>;
