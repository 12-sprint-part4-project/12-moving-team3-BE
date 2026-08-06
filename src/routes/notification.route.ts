import { Router } from 'express';
import * as notificationController from '../controllers/notification.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import { notificationIdParamsSchema } from '../schemas/notification.schema';

const router = Router();

// Swagger: src/docs/notification.swagger.yaml
// 정적 경로(/stream)를 /:notificationId 보다 먼저 등록

/** GET /api/notifications — 로그인 유저 본인 알림 (역할 path 분기 없음) */
router.get('/', requireAuth, notificationController.getNotifications);

// EventSource는 Authorization 헤더를 못 보내므로 FE는 fetch 기반 SSE 클라이언트 사용
router.get(
  '/stream',
  requireAuth,
  notificationController.openNotificationStream
);

router.patch(
  '/:notificationId',
  requireAuth,
  validateRequest({
    params: notificationIdParamsSchema,
    errorCode: 'INVALID_QUERY_PARAM',
  }),
  notificationController.markAsRead
);

export default router;
