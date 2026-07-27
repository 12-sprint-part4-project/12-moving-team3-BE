import { z } from 'zod';

/** POST /api/chat/rooms 요청 body 스키마 */
export const createChatRoomBodySchema = z.object({
  moverId: z.string(), // 테스트 후 UUID로 변경 필요
  estimateRequestId: z.number().int().positive().optional(),
  designatedMoverId: z.number().int().positive().optional(),
  quoteId: z.number().int().positive().optional(),
  roomType: z.enum(['GENERAL', 'DESIGNATED', 'COMMUNITY']),
});

export type CreateChatRoomBody = z.infer<typeof createChatRoomBodySchema>;
