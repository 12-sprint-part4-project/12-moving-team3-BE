import type { Request, Response } from 'express';
import type { AdminLoginBody } from '../schemas/admin-auth.schema';
import * as adminAuthService from '../services/admin-auth.service';
import { getAuthenticatedAdmin } from '../utils/admin-auth.util';
import {
  ADMIN_REFRESH_TOKEN_COOKIE_NAME,
  clearAdminRefreshTokenCookie,
  setAdminRefreshTokenCookie,
} from '../utils/admin-cookie.util';
import { resolveAdminDeviceType } from '../utils/admin-device.util';

export const loginAdmin = async (req: Request, res: Response) => {
  const body = req.body as AdminLoginBody;

  const result = await adminAuthService.loginAdmin({
    ...body,
    device: resolveAdminDeviceType(req.get('user-agent')),
  });

  setAdminRefreshTokenCookie(
    res,
    result.refreshToken,
    result.refreshTokenMaxAgeMs
  );

  res.status(200).json({
    data: {
      accessToken: result.accessToken,
      admin: result.admin,
    },
  });
};

export const refreshAdminToken = async (req: Request, res: Response) => {
  // 쿠키 유무·유효성 판단은 Service(validateAdminRefreshToken)에만 둔다.
  const result = await adminAuthService.refreshAdminToken(
    req.cookies?.[ADMIN_REFRESH_TOKEN_COOKIE_NAME]
  );

  // 기존 Refresh Cookie와 원래 만료 시각은 그대로 두고 Access Token만 반환한다.
  res.status(200).json({
    data: {
      accessToken: result.accessToken,
    },
  });
};

export const logoutAdmin = async (req: Request, res: Response) => {
  await adminAuthService.logoutAdmin(
    req.cookies?.[ADMIN_REFRESH_TOKEN_COOKIE_NAME]
  );

  // 쿠키 유무와 관계없이 제거해 브라우저 쪽 인증 상태도 정리한다.
  clearAdminRefreshTokenCookie(res);

  res.status(200).json({
    data: {
      message: '로그아웃되었습니다.',
    },
  });
};

export const getAdminMe = async (_req: Request, res: Response) => {
  const { adminId } = getAuthenticatedAdmin(res);
  const data = await adminAuthService.getAdminMe(adminId);

  res.status(200).json({ data });
};
