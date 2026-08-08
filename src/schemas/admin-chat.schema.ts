import { ChatRoomType } from '@prisma/client';
import { z } from 'zod';
import { listQuerySchema } from './admin-list-query.schema';

/** 관리자 채팅방 목록 조회 Query 스키마 */
export const adminChatListQuerySchema = listQuerySchema.extend({
  // ChatRoom.roomType과 동일한 Prisma enum만 허용해 잘못된 필터 값이 DB 조회까지 내려가지 않게 한다.
  roomType: z.enum(ChatRoomType).optional(),
});

export type AdminChatListQuery = z.infer<typeof adminChatListQuerySchema>;

/**
 * 관리자 채팅방 상세·메시지 경로 Params.
 * ChatRoom.id(Int)와 맞추고, Express params 문자열은 coerce로 숫자 변환한다.
 */
export const adminChatRoomParamsSchema = z.object({
  roomId: z.coerce.number().int().positive(),
});

export type AdminChatRoomParams = z.infer<typeof adminChatRoomParamsSchema>;

/**
 * 관리자 채팅 메시지 히스토리 Query.
 * 사용자 `getChatMessagesQuerySchema`와 동일하게 before 커서·limit(default 30, max 100)를 쓴다.
 */
export const adminChatMessagesQuerySchema = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
});

export type AdminChatMessagesQuery = z.infer<typeof adminChatMessagesQuerySchema>;
