import { ChatRoomType } from '@prisma/client';
import { z } from 'zod';
import { listQuerySchema } from './admin-list-query.schema';
import { chatMessagesQuerySchema } from './chat-messages-query.schema';

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
 * 공통 chatMessagesQuerySchema를 명시적으로 재사용한다.
 * (사용자 Schema에 직접 종속시키지 않아 정책 변경이 연쇄되지 않게 한다.)
 */
export const adminChatMessagesQuerySchema = chatMessagesQuerySchema;

export type AdminChatMessagesQuery = z.infer<
  typeof adminChatMessagesQuerySchema
>;
