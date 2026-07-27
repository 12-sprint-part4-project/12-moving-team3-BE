import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { UserType } from '@prisma/client';
import { AppError } from '../utils/app.error';

/** 문자열이 Prisma UserType(CUSTOMER|MOVER)인지 확인한다. */
const isUserType = (value: string): value is UserType => {
  return value === 'CUSTOMER' || value === 'MOVER';
};

/**
 * 일반 유저 인증 미들웨어.
 * 인증 담당 구현 전까지는 개발용 헤더(x-user-id, x-user-type)로 대체한다.
 * 실제 JWT 미들웨어가 붙으면 이 mock 분기만 제거하면 된다.
 */
export const requireAuth: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    if (req.user?.id && req.user.userType) {
      next();
      return;
    }

    const userId = req.header('x-user-id');
    const userType = req.header('x-user-type');

    if (userId && userType && isUserType(userType)) {
      req.user = {
        id: userId,
        userType,
      };
      next();
      return;
    }

    throw new AppError('UNAUTHORIZED');
  } catch (error) {
    next(error);
  }
};
