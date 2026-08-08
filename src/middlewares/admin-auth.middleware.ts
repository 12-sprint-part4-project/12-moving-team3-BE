import type { RequestHandler } from 'express';
import { JsonWebTokenError } from 'jsonwebtoken';
import { auditContextStorage } from '../lib/request-context';
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

    // History actor용 — res.locals와 동일한 adminId를 요청 컨텍스트에 심는다.
    const store = auditContextStorage.getStore();
    if (store) {
      store.adminId = payload.sub;
    }

    next();
  } catch (error) {
    // JWT 인증 실패만 401로 통일하고, 환경변수 누락 등 서버 오류는 그대로 넘겨 500 처리한다.
    if (error instanceof AppError && error.code === 'ADMIN_UNAUTHORIZED') {
      next(error);
      return;
    }

    // TokenExpiredError·NotBeforeError는 JsonWebTokenError를 상속한다.
    if (error instanceof JsonWebTokenError) {
      next(new AppError('ADMIN_UNAUTHORIZED'));
      return;
    }

    next(error);
  }
};
