import { z } from 'zod';
import { CHAT_ATTACHMENT_MAX_COUNT } from '../constants/chat-attachment.constants';

/** POST /api/chat/rooms — 견적(GENERAL·DESIGNATED) 채팅방 생성 body */
const createEstimateChatRoomBodySchema = z.object({
  moverId: z.string(), // 테스트 후 UUID로 변경 필요
  estimateRequestId: z.number().int().positive().optional(),
  designatedMoverId: z.number().int().positive().optional(),
  quoteId: z.number().int().positive().optional(),
  roomType: z.enum(['GENERAL', 'DESIGNATED']),
});

/** POST /api/chat/rooms — 가구나눔(COMMUNITY) 채팅방 생성 body */
const createCommunityChatRoomBodySchema = z.object({
  /** 상대 users.id (게시글 작성자). 견적 API와 필드명 공유 */
  moverId: z.string(),
  communityPostId: z.number().int().positive(),
  roomType: z.literal('COMMUNITY'),
});

/** POST /api/chat/rooms 요청 body 스키마 */
export const createChatRoomBodySchema = z.union([
  createCommunityChatRoomBodySchema,
  createEstimateChatRoomBodySchema,
]);

export type CreateChatRoomBody = z.infer<typeof createChatRoomBodySchema>;
export type CreateCommunityChatRoomBody = z.infer<
  typeof createCommunityChatRoomBodySchema
>;
export type CreateEstimateChatRoomBody = z.infer<
  typeof createEstimateChatRoomBodySchema
>;

/** GET /api/chat/rooms/:roomId 경로 파라미터 스키마 */
export const chatRoomIdParamsSchema = z.object({
  roomId: z.coerce.number().int().positive(),
});

export type ChatRoomIdParams = z.infer<typeof chatRoomIdParamsSchema>;

/** GET /api/chat/rooms/:roomId/messages 쿼리 스키마 */
export const getChatMessagesQuerySchema = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
});

export type GetChatMessagesQuery = z.infer<typeof getChatMessagesQuerySchema>;

/** POST /api/chat/rooms/:roomId/messages 요청 body 스키마 (TEXT | IMAGE) */
export const sendChatMessageBodySchema = z.discriminatedUnion('messageType', [
  z.object({
    messageType: z.literal('TEXT'),
    content: z.string().trim().min(1).max(2000),
  }),
  z.object({
    messageType: z.literal('IMAGE'),
    attachments: z
      .array(z.string().trim().min(1))
      .min(1)
      .max(CHAT_ATTACHMENT_MAX_COUNT),
  }),
]);

export type SendChatMessageBody = z.infer<typeof sendChatMessageBodySchema>;

/** POST /api/chat/rooms/:roomId/read 요청 body 스키마 */
export const markChatRoomAsReadBodySchema = z.object({
  lastReadMessageId: z.number().int().positive(),
});

export type MarkChatRoomAsReadBody = z.infer<
  typeof markChatRoomAsReadBodySchema
>;
