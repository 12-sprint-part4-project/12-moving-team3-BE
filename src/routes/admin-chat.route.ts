import { Router } from 'express';
import * as adminChatController from '../controllers/admin-chat.controller';
import { requireAdminAuth } from '../middlewares/admin-auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import { adminChatListQuerySchema } from '../schemas/admin-chat.schema';

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

export default router;
