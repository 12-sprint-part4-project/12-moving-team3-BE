import type { RequestHandler, Response } from 'express';
import type { ApiUserType } from '../schemas/auth.schema';
import { AppError } from '../utils/app.error';
import { verifyAccessToken } from '../utils/auth-jwt.util';

export interface AuthenticatedUser {
  userId: string;
  userType: ApiUserType;
}

/** Access Token 필수. 성공 시 res.locals.user에 저장 */
export const requireAuth: RequestHandler = (req, res, next) => {
  try {
    const header = req.get('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;

    if (!token) {
      throw new AppError('UNAUTHORIZED');
    }

    const payload = verifyAccessToken(token);

    res.locals.user = {
      userId: payload.sub,
      userType: payload.userType,
    } satisfies AuthenticatedUser;

    next();
  } catch {
    next(new AppError('UNAUTHORIZED'));
  }
};

/** requireAuth 뒤에 사용. 허용된 userType만 통과 */
export const allowUserTypes =
  (...types: ApiUserType[]): RequestHandler =>
  (_req, res, next) => {
    const user = res.locals.user as AuthenticatedUser | undefined;

    if (!user) {
      next(new AppError('UNAUTHORIZED'));
      return;
    }

    if (!types.includes(user.userType)) {
      next(new AppError('USER_TYPE_FORBIDDEN'));
      return;
    }

    next();
  };

export const getAuthenticatedUser = (res: Response): AuthenticatedUser => {
  const user = res.locals.user as AuthenticatedUser | undefined;

  if (!user) {
    throw new AppError('UNAUTHORIZED');
  }

  return user;
};
