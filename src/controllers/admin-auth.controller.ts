import type { Request, Response } from 'express';
import { adminLoginBodySchema } from '../schemas/admin-auth.schema';
import * as adminAuthService from '../services/admin-auth.service';
import { AppError } from '../utils/app.error';
import { setAdminRefreshTokenCookie } from '../utils/admin-cookie.util';
import { resolveAdminDeviceType } from '../utils/admin-device.util';

export const login = async (req: Request, res: Response) => {
  const parsedBody = adminLoginBodySchema.safeParse(req.body);

  if (!parsedBody.success) {
    throw new AppError('ADMIN_INVALID_LOGIN_BODY');
  }

  const result = await adminAuthService.login({
    ...parsedBody.data,
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
