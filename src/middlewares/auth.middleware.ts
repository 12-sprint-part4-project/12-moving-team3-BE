import { UserStatus } from '@prisma/client';
import type { RequestHandler, Response } from 'express';
import { JsonWebTokenError } from 'jsonwebtoken';
import { auditContextStorage } from '../lib/request-context';
import * as authRepository from '../repositories/auth.repository';
import type { ApiUserType } from '../schemas/auth.schema';
import { verifyAdminAccessToken } from '../utils/admin-jwt.util';
import { AppError } from '../utils/app.error';
import { verifyAccessToken } from '../utils/auth-jwt.util';
import { isUserAuthRole } from '../utils/auth-role.util';

export interface AuthenticatedUser {
  userId: string;
  userType: ApiUserType;
}

export interface AuthenticatedAdmin {
  adminId: number;
  role: 'ADMIN';
}

const readBearerToken = (
  req: Parameters<RequestHandler>[0]
): string | null => {
  const header = req.get('authorization');
  return header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
};

/** Audit Context에 userId를 심는다. 스토어가 없으면(미들웨어 미적용) 경고만 남긴다. */
const setAuditUserId = (userId: string): void => {
  const store = auditContextStorage.getStore();
  if (store) {
    store.userId = userId;
    return;
  }

  console.warn(
    '[auth] audit context store missing — History user_id may be null'
  );
};

const setAuditAdminId = (adminId: number): void => {
  const store = auditContextStorage.getStore();
  if (store) {
    store.adminId = adminId;
    return;
  }

  console.warn(
    '[admin-auth] audit context store missing — History admin_user_id may be null'
  );
};

const authenticateUserAccessToken = (
  req: Parameters<RequestHandler>[0]
): AuthenticatedUser => {
  const token = readBearerToken(req);

  if (!token) {
    throw new AppError('UNAUTHORIZED');
  }

  const payload = verifyAccessToken(token);

  if (!isUserAuthRole(payload.role)) {
    throw new AppError('USER_TYPE_FORBIDDEN');
  }

  return {
    userId: payload.sub,
    userType: payload.role,
  };
};

const authenticateAdminAccessToken = (
  req: Parameters<RequestHandler>[0]
): AuthenticatedAdmin => {
  const token = readBearerToken(req);

  if (!token) {
    throw new AppError('ADMIN_UNAUTHORIZED');
  }

  const payload = verifyAdminAccessToken(token);

  if (payload.role !== 'ADMIN') {
    throw new AppError('ADMIN_UNAUTHORIZED');
  }

  return {
    adminId: payload.sub,
    role: 'ADMIN',
  };
};

/**
 * Access Token 필수. 정지 계정도 통과한다.
 * 헤더용 프로필 조회처럼 로그인 유지가 필요한 읽기 API에 사용.
 * CUSTOMER|MOVER만 허용한다.
 */
export const requireAuthAllowSuspended: RequestHandler = (req, res, next) => {
  try {
    res.locals.user = authenticateUserAccessToken(req);
    setAuditUserId(res.locals.user.userId);
    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }

    next(new AppError('UNAUTHORIZED'));
  }
};

/** Access Token 필수. CUSTOMER|MOVER만 통과. 정지 계정이면 USER_SUSPENDED. */
export const requireAuth: RequestHandler = async (req, res, next) => {
  try {
    const user = authenticateUserAccessToken(req);
    // await 전에 actor를 심어, Prisma 조회 중 ALS가 흔들려도 Extension이 읽을 값을 남긴다.
    res.locals.user = user;
    setAuditUserId(user.userId);

    const userStatus = await authRepository.findUserStatusByUserId(user.userId);

    if (userStatus?.status === UserStatus.SUSPENDED) {
      throw new AppError('USER_SUSPENDED');
    }

    // await 이후에도 스토어가 있으면 다시 한번 보강
    setAuditUserId(user.userId);
    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }

    next(new AppError('UNAUTHORIZED'));
  }
};

/**
 * 관리자 Access Token 필수. role === ADMIN 만 통과한다.
 * 성공 시 res.locals.admin에 저장하고 감사 컨텍스트에 adminId를 심는다.
 */
export const requireAdmin: RequestHandler = (req, res, next) => {
  try {
    const admin = authenticateAdminAccessToken(req);
    res.locals.admin = admin;
    setAuditAdminId(admin.adminId);
    next();
  } catch (error) {
    if (error instanceof AppError && error.code === 'ADMIN_UNAUTHORIZED') {
      next(error);
      return;
    }

    if (error instanceof JsonWebTokenError) {
      next(new AppError('ADMIN_UNAUTHORIZED'));
      return;
    }

    next(error);
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

export const getAuthenticatedAdmin = (res: Response): AuthenticatedAdmin => {
  const admin = res.locals.admin as AuthenticatedAdmin | undefined;

  if (!admin || typeof admin.adminId !== 'number' || admin.role !== 'ADMIN') {
    throw new AppError('ADMIN_UNAUTHORIZED');
  }

  return admin;
};

/**
 * Access Token 선택. 토큰이 없거나 유효하지 않으면 비로그인으로 통과하고,
 * 유효한 토큰이 있으면 검증 후 res.locals.user에 저장한다.
 * 정지 여부는 검사하지 않는다 — 공개/둘러보기 API용. CUSTOMER|MOVER만 로그인으로 취급한다.
 */
export const optionalAuth: RequestHandler = (req, res, next) => {
  const token = readBearerToken(req);

  if (!token) {
    next();
    return;
  }

  try {
    const payload = verifyAccessToken(token);

    if (!isUserAuthRole(payload.role)) {
      next();
      return;
    }

    res.locals.user = {
      userId: payload.sub,
      userType: payload.role,
    } satisfies AuthenticatedUser;
    setAuditUserId(payload.sub);
  } catch {
    // 선택적 인증: 만료·잘못된 토큰은 비로그인으로 취급
  }

  next();
};

/** optionalAuth 뒤에 사용. 로그인한 경우에만 user를 반환한다. */
export const getOptionalAuthenticatedUser = (
  res: Response
): AuthenticatedUser | undefined => {
  return res.locals.user as AuthenticatedUser | undefined;
};
