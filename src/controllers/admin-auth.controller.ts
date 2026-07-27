import type { Request, Response } from 'express';
import type { AdminLoginBody } from '../schemas/admin-auth.schema';
import * as adminAuthService from '../services/admin-auth.service';
import { setAdminRefreshTokenCookie } from '../utils/admin-cookie.util';
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
