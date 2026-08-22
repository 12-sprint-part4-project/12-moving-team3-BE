import { UserStatus, UserType } from '@prisma/client';
import { z } from 'zod';
import {
  listQuerySchema,
  sortDirectionSchema,
} from './admin-list-query.schema';
import { adminStatisticsFilterSchema } from './admin-statistics.schema';

/** 관리자 회원 목록 조회 Query 스키마 */
export const adminMemberListQuerySchema = listQuerySchema
  .extend({
    // 이름 또는 닉네임 부분 일치. 빈 문자열은 조건으로 쓰지 않는다.
    userName: z.string().trim().min(1).optional(),
    // 이메일 부분 일치. 형식 검증은 하지 않아 일부 문자열 검색을 허용한다.
    email: z.string().trim().min(1).optional(),
    phoneNumber: z
      .string()
      .trim()
      .min(1)
      .refine((value) => value.replace(/\D/g, '').length > 0)
      .optional(),
    // User.userType과 동일한 Prisma enum만 허용해 잘못된 필터 값이 DB 조회까지 내려가지 않게 한다.
    userType: z.enum(UserType).optional(),
    // UserStatusInfo.status와 동일한 Prisma enum만 허용해 상태 필터 의미를 스키마와 일치시킨다.
    status: z.enum(UserStatus).optional(),
    // 미전달 시 DESC. 기존 최신 가입순 목록 호출과 호환된다.
    sort: sortDirectionSchema.optional(),
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
