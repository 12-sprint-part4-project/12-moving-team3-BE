import type { Response } from 'express';
import type { AuthenticatedAdmin } from '../middlewares/admin-auth.middleware';
import { AppError } from './app.error';

/**
 * requireAdminAuth가 저장한 관리자 신원을 꺼낸다.
 * 미들웨어를 거치지 않았거나 값이 비정상이면 401로 막아 이후 로직이 진행되지 않게 한다.
 */
export const getAuthenticatedAdmin = (res: Response): AuthenticatedAdmin => {
  const admin = res.locals.admin as AuthenticatedAdmin | undefined;

  if (!admin || typeof admin.adminId !== 'number') {
    throw new AppError('ADMIN_UNAUTHORIZED');
  }

  return admin;
};
