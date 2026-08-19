import type { NextFunction, Request, Response } from 'express';
import type { NotificationIdParams } from '../schemas/notification.schema';
import * as notificationService from '../services/notification.service';
import * as notificationSse from '../services/notification-sse.service';
import { getAuthenticatedUser } from '../middlewares/auth.middleware';
import { AppError } from '../utils/app.error';

const getValidatedParams = <T>(res: Response): T => {
  const value = res.locals.validated?.params;

  if (value == null || typeof value !== 'object') {
    throw new AppError('INVALID_QUERY_PARAM');
  }

  return value as T;
};

/** GET /api/notifications — 최신 최대 10개 (수신자 = 로그인 userId) */
export const getNotifications = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = getAuthenticatedUser(res);
    const { items, meta } =
      await notificationService.getNotificationsForReceiver(userId);

    res.status(200).json({ data: { items }, meta });
  } catch (error) {
    next(error);
  }
};

/** PATCH /api/notifications/:notificationId — 단건 읽음 */
export const markAsRead = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = getAuthenticatedUser(res);
    const { notificationId } = getValidatedParams<NotificationIdParams>(res);
    const data = await notificationService.markNotificationAsRead(
      notificationId,
      userId
    );

    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/notifications/stream
 * Authorization: Bearer (requireAuth). URL에 access token을 넣지 않는다.
 * 네이티브 EventSource는 헤더를 못 보내므로 FE는 fetch 기반 SSE 클라이언트를 쓴다.
 */
export const openNotificationStream = (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = getAuthenticatedUser(res);
    notificationSse.subscribe(userId, res);
  } catch (error) {
    next(error);
  }
};
