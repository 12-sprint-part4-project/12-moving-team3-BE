import { UserStatus, UserType } from '@prisma/client';
import { z } from 'zod';

/** 관리자 회원 목록 기본 페이지 크기 */
const DEFAULT_ADMIN_MEMBER_LIST_PAGE_SIZE = 10;

/**
 * 관리자 회원 목록 pageSize 상한.
 * page 기반 목록인 quoteListQuerySchema의 limit.max(50) 정책을 따른다.
 */
const MAX_ADMIN_MEMBER_LIST_PAGE_SIZE = 50;

/** 관리자 회원 목록 조회 Query 스키마 */
export const adminMemberListQuerySchema = z.object({
  // User.userType과 동일한 Prisma enum만 허용해 잘못된 필터 값이 DB 조회까지 내려가지 않게 한다.
  userType: z.enum(UserType).optional(),
  // UserStatusInfo.status와 동일한 Prisma enum만 허용해 상태 필터 의미를 스키마와 일치시킨다.
  status: z.enum(UserStatus).optional(),
  // 검색어는 앞뒤 공백을 제거하고, 빈 문자열은 조건으로 쓰지 않는다(기존 keyword 컨벤션과 동일).
  search: z.string().trim().min(1).optional(),
  // URL query는 문자열이므로 coerce로 숫자 변환하고, 1페이지부터만 허용한다.
  page: z.coerce.number().int().min(1).optional().default(1),
  // 과도한 조회를 막기 위해 상한을 두고, 미전달 시 기본 pageSize를 적용한다.
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_ADMIN_MEMBER_LIST_PAGE_SIZE)
    .optional()
    .default(DEFAULT_ADMIN_MEMBER_LIST_PAGE_SIZE),
});

export type AdminMemberListQuery = z.infer<typeof adminMemberListQuerySchema>;
