import { Router } from 'express';
import * as chatController from '../controllers/chat.controller';
import {
  requireAuth,
  requireAuthAllowSuspended,
} from '../middlewares/auth.middleware';
import { requireCompletedProfile } from '../middlewares/profile.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import {
  chatRoomIdParamsSchema,
  createChatRoomBodySchema,
  getChatMessagesQuerySchema,
  markChatRoomAsReadBodySchema,
  sendChatMessageBodySchema,
} from '../schemas/chat.schema';

const router = Router();

// 채팅방 목록 조회 (Swagger: src/docs/chat.swagger.yaml)
router.get('/rooms', requireAuthAllowSuspended, chatController.getChatRoomList);

// 전체 미읽음 수 조회 (Swagger: src/docs/chat.swagger.yaml)
router.get(
  '/unread-count',
  requireAuthAllowSuspended,
  chatController.getUnreadCount
);

// 메시지 이력을 `/:roomId`보다 먼저 등록해 경로가 상세 조회로 잡히지 않게 한다
// (Swagger: src/docs/chat.swagger.yaml)
router.get(
  '/rooms/:roomId/messages',
  requireAuth,
  requireCompletedProfile,
  validateRequest({
    params: chatRoomIdParamsSchema,
    query: getChatMessagesQuerySchema,
    errorCode: 'INVALID_REQUEST',
  }),
  chatController.getChatMessages
);

// 채팅 메시지 전송 (Swagger: src/docs/chat.swagger.yaml)
router.post(
  '/rooms/:roomId/messages',
  requireAuth,
  requireCompletedProfile,
  validateRequest({
    params: chatRoomIdParamsSchema,
    body: sendChatMessageBodySchema,
    errorCode: 'INVALID_REQUEST',
  }),
  chatController.sendChatMessage
);

// 채팅방 읽음 처리 (Swagger: src/docs/chat.swagger.yaml)
router.post(
  '/rooms/:roomId/read',
  requireAuth,
  requireCompletedProfile,
  validateRequest({
    params: chatRoomIdParamsSchema,
    body: markChatRoomAsReadBodySchema,
    errorCode: 'INVALID_REQUEST',
  }),
  chatController.markChatRoomAsRead
);

// 채팅방 나가기 (Swagger: src/docs/chat.swagger.yaml)
router.post(
  '/rooms/:roomId/leave',
  requireAuth,
  requireCompletedProfile,
  validateRequest({
    params: chatRoomIdParamsSchema,
    errorCode: 'INVALID_REQUEST',
  }),
  chatController.leaveChatRoom
);

// 채팅방 상세 조회 (Swagger: src/docs/chat.swagger.yaml)
router.get(
  '/rooms/:roomId',
  requireAuth,
  requireCompletedProfile,
  validateRequest({
    params: chatRoomIdParamsSchema,
    errorCode: 'INVALID_REQUEST',
  }),
  chatController.getChatRoomDetail
);

// 채팅방 생성 (Swagger: src/docs/chat.swagger.yaml)
router.post(
  '/rooms',
  requireAuth,
  requireCompletedProfile,
  validateRequest({
    body: createChatRoomBodySchema,
    errorCode: 'INVALID_REQUEST',
  }),
  chatController.createChatRoom
);

export default router;
