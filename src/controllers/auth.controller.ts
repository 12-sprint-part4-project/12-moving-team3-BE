import type { Request, Response } from 'express';
import { parseLoginBody, parseSignupBody } from '../schemas/auth.schema';
import * as authService from '../services/auth.service';
import { setAuthRefreshTokenCookie } from '../utils/auth-cookie.util';
import { resolveAuthDeviceType } from '../utils/auth-device.util';

export const login = async (req: Request, res: Response) => {
  const body = parseLoginBody(req.body);

  const result = await authService.login({
    ...body,
    device: resolveAuthDeviceType(req.get('user-agent')),
  });

  setAuthRefreshTokenCookie(
    res,
    result.refreshToken,
    result.refreshTokenMaxAgeMs
  );

  res.status(200).json({
    data: {
      user: result.user,
      accessToken: result.accessToken,
    },
  });
};

export const signup = async (req: Request, res: Response) => {
  const body = parseSignupBody(req.body);

  const result = await authService.signup({
    ...body,
    device: resolveAuthDeviceType(req.get('user-agent')),
  });

  setAuthRefreshTokenCookie(
    res,
    result.refreshToken,
    result.refreshTokenMaxAgeMs
  );

  res.status(201).json({
    data: {
      user: result.user,
      accessToken: result.accessToken,
    },
  });
};
