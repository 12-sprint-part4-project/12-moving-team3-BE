import type { NextFunction, Request, Response } from 'express';
import type {
  NotificationIdParams,
  NotificationStreamQuery,
} from '../schemas/notification.schema';
import * as notificationService from '../services/notification.service';
import * as notificationSse from '../services/notification-sse.service';
import {
  getAuthenticatedUser,
  type AuthenticatedUser,
} from '../middlewares/auth.middleware';
import { AppError } from '../utils/app.error';
import { verifyAccessToken } from '../utils/auth-jwt.util';

const getValidatedParams = <T>(res: Response): T => {
  const value = res.locals.validated?.params;

  if (value == null || typeof value !== 'object') {
    throw new AppError('INVALID_QUERY_PARAM');
  }

  return value as T;
};

const getValidatedQuery = <T>(res: Response): T => {
  const value = res.locals.validated?.query;

  if (value == null || typeof value !== 'object') {
    throw new AppError('INVALID_QUERY_PARAM');
  }

  return value as T;
};

/** GET /api/notifications/customer | /mover — 최신 최대 10개 */
export const getNotifications = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = getAuthenticatedUser(res);
    const data = await notificationService.getNotificationsForReceiver(userId);

    res.status(200).json({ data });
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
    const { notificationId } =
      getValidatedParams<NotificationIdParams>(res);
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
 * GET /api/notifications/stream?accessToken=
 * EventSource는 Authorization 헤더를 못 보내므로 query JWT 사용.
 */
export const openNotificationStream = (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { accessToken } = getValidatedQuery<NotificationStreamQuery>(res);
    const payload = verifyAccessToken(accessToken);

    const user: AuthenticatedUser = {
      userId: payload.sub,
      userType: payload.userType,
    };
    res.locals.user = user;

    notificationSse.subscribe(user.userId, res);
  } catch {
    next(new AppError('UNAUTHORIZED'));
  }
};
