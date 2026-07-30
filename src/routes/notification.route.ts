import { Router } from 'express';
import * as notificationController from '../controllers/notification.controller';
import { allowUserTypes, requireAuth } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import { notificationIdParamsSchema } from '../schemas/notification.schema';

const router = Router();

// Swagger: src/docs/notification.swagger.yaml
// 정적 경로(/customer, /mover, /stream)를 /:notificationId 보다 먼저 등록

router.get(
  '/customer',
  requireAuth,
  allowUserTypes('CUSTOMER'),
  notificationController.getNotifications
);

router.get(
  '/mover',
  requireAuth,
  allowUserTypes('MOVER'),
  notificationController.getNotifications
);

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
