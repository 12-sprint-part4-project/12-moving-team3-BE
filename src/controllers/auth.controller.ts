import type { Request, Response } from 'express';
import { parseSignupBody } from '../schemas/auth.schema';
import * as authService from '../services/auth.service';
import { resolveAuthDeviceType } from '../utils/auth-device.util';

export const signup = async (req: Request, res: Response) => {
  const body = parseSignupBody(req.body);

  const result = await authService.signup({
    ...body,
    device: resolveAuthDeviceType(req.get('user-agent')),
  });

  res.status(201).json({
    data: {
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    },
  });
};
