import type { Request, Response } from 'express';
import type { AuthenticatedAdmin } from '../middlewares/admin-auth.middleware';
import type { AdminLoginBody } from '../schemas/admin-auth.schema';
import * as adminAuthService from '../services/admin-auth.service';
import {
  ADMIN_REFRESH_TOKEN_COOKIE_NAME,
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

  setAdminRefreshTokenCookie(
    res,
    result.refreshToken,
    result.refreshTokenMaxAgeMs
  );

  // Refresh Token은 쿠키로만 전달하고 Body에는 Access Token만 노출한다.
  res.status(200).json({
    data: {
      accessToken: result.accessToken,
    },
  });
};

export const getAdminMe = async (_req: Request, res: Response) => {
  const { adminId } = res.locals.admin as AuthenticatedAdmin;
  const data = await adminAuthService.getAdminMe(adminId);

  res.status(200).json({ data });
};
