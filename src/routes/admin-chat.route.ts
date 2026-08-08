import { Router } from 'express';
import * as adminChatController from '../controllers/admin-chat.controller';
import { requireAdminAuth } from '../middlewares/admin-auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import {
  adminChatListQuerySchema,
  adminChatMessagesQuerySchema,
  adminChatRoomParamsSchema,
} from '../schemas/admin-chat.schema';

const router = Router();

// 관리자 채팅방 목록 조회 (Swagger: src/docs/admin-chat.swagger.yaml)
router.get(
  '/',
  requireAdminAuth,
  validateRequest({
    query: adminChatListQuerySchema,
    errorCode: 'ADMIN_INVALID_QUERY_PARAM',
  }),
  adminChatController.getAdminChatList
);

// 메시지 이력을 `/:roomId`보다 먼저 등록해 경로가 상세 조회로 잡히지 않게 한다
router.get(
  '/:roomId/messages',
  requireAdminAuth,
  validateRequest({
    params: adminChatRoomParamsSchema,
    query: adminChatMessagesQuerySchema,
    errorCode: 'ADMIN_INVALID_QUERY_PARAM',
  }),
  adminChatController.getAdminChatMessages
);

// 관리자 채팅방 상세 조회
router.get(
  '/:roomId',
  requireAdminAuth,
  validateRequest({
    params: adminChatRoomParamsSchema,
    errorCode: 'ADMIN_INVALID_QUERY_PARAM',
  }),
  adminChatController.getAdminChatDetail
);

export default router;
