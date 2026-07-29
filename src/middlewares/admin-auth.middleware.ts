import type { RequestHandler } from 'express';
import { AppError } from '../utils/app.error';
import { verifyAdminAccessToken } from '../utils/admin-jwt.util';

export interface AuthenticatedAdmin {
  adminId: number;
}

/** 관리자 Access Token 필수. 성공 시 res.locals.admin에 저장 */
export const requireAdminAuth: RequestHandler = (req, res, next) => {
  try {
    const header = req.get('authorization');
    // Bearer 접두사만 허용해 스키마 없는 토큰 전달을 거절한다.
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;

    if (!token) {
      throw new AppError('ADMIN_UNAUTHORIZED');
    }

    const payload = verifyAdminAccessToken(token);

    // req에 붙이지 않고 locals에 두어, 이후 미들웨어·컨트롤러가 같은 요청 안에서만 인증 결과를 읽게 한다.
    res.locals.admin = {
      adminId: payload.sub,
    } satisfies AuthenticatedAdmin;

    next();
  } catch {
    next(new AppError('ADMIN_UNAUTHORIZED'));
  }
};
