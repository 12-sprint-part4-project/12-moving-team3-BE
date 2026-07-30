import { Router } from 'express';
import * as notificationController from '../controllers/notification.controller';
import { allowUserTypes, requireAuth } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import {
  notificationIdParamsSchema,
  notificationStreamQuerySchema,
} from '../schemas/notification.schema';

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

router.get(
  '/stream',
  validateRequest({
    query: notificationStreamQuerySchema,
    errorCode: 'UNAUTHORIZED',
  }),
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
