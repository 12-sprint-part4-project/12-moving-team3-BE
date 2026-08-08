import { ChatRoomType } from '@prisma/client';
import { z } from 'zod';
import { listQuerySchema } from './admin-list-query.schema';

/** 관리자 채팅방 목록 조회 Query 스키마 */
export const adminChatListQuerySchema = listQuerySchema.extend({
  // ChatRoom.roomType과 동일한 Prisma enum만 허용해 잘못된 필터 값이 DB 조회까지 내려가지 않게 한다.
  roomType: z.enum(ChatRoomType).optional(),
});

export type AdminChatListQuery = z.infer<typeof adminChatListQuerySchema>;
