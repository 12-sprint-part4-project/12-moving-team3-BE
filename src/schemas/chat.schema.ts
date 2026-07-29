import { z } from 'zod';
import { CHAT_ATTACHMENT_ALLOWED_CONTENT_TYPES } from '../constants/chat-attachment.constants';

/** POST /api/chat/rooms 요청 body 스키마 */
export const createChatRoomBodySchema = z.object({
  moverId: z.string(), // 테스트 후 UUID로 변경 필요
  estimateRequestId: z.number().int().positive().optional(),
  designatedMoverId: z.number().int().positive().optional(),
  quoteId: z.number().int().positive().optional(),
  roomType: z.enum(['GENERAL', 'DESIGNATED', 'COMMUNITY']),
});

export type CreateChatRoomBody = z.infer<typeof createChatRoomBodySchema>;

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

/** POST /api/chat/rooms/:roomId/messages 요청 body 스키마 (TEXT만) */
export const sendChatMessageBodySchema = z.object({
  messageType: z.literal('TEXT'),
  content: z.string().trim().min(1).max(2000),
});

export type SendChatMessageBody = z.infer<typeof sendChatMessageBodySchema>;

/** POST /api/chat/rooms/:roomId/read 요청 body 스키마 */
export const markChatRoomAsReadBodySchema = z.object({
  lastReadMessageId: z.number().int().positive(),
});

export type MarkChatRoomAsReadBody = z.infer<
  typeof markChatRoomAsReadBodySchema
>;

/** POST /api/chat/attachments/presign 요청 body 스키마 */
export const presignChatAttachmentBodySchema = z.object({
  contentType: z.enum(CHAT_ATTACHMENT_ALLOWED_CONTENT_TYPES),
  fileSize: z.number().int().positive(),
});

export type PresignChatAttachmentBody = z.infer<
  typeof presignChatAttachmentBodySchema
>;
