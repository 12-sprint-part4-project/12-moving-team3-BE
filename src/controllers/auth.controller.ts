import type { Request, Response } from 'express';
import { getAuthenticatedUser } from '../middlewares/auth.middleware';
import {
  parseKakaoLoginBody,
  parseLoginBody,
  parseSignupBody,
} from '../schemas/auth.schema';
import * as authService from '../services/auth.service';
import {
  AUTH_REFRESH_TOKEN_COOKIE_NAME,
  clearAuthRefreshTokenCookie,
  setAuthRefreshTokenCookie,
} from '../utils/auth-cookie.util';
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

export const logout = async (req: Request, res: Response) => {
  await authService.logout(req.cookies?.[AUTH_REFRESH_TOKEN_COOKIE_NAME]);

  // 쿠키 유무와 관계없이 제거해 브라우저 쪽 인증 상태도 정리한다.
  clearAuthRefreshTokenCookie(res);

  res.status(200).json({
    data: {
      message: '로그아웃되었습니다.',
    },
  });
};

export const refreshAuthToken = async (req: Request, res: Response) => {
  const result = await authService.refreshAuthToken(
    req.cookies?.[AUTH_REFRESH_TOKEN_COOKIE_NAME]
  );

  setAuthRefreshTokenCookie(
    res,
    result.refreshToken,
    result.refreshTokenMaxAgeMs
  );

  res.status(200).json({
    data: {
      accessToken: result.accessToken,
    },
  });
};

export const kakaoLogin = async (req: Request, res: Response) => {
  const body = parseKakaoLoginBody(req.body);

  const result = await authService.kakaoLogin({
    ...body,
    device: resolveAuthDeviceType(req.get('user-agent')),
  });

  setAuthRefreshTokenCookie(
    res,
    result.refreshToken,
    result.refreshTokenMaxAgeMs
  );

  res.status(result.isNewUser ? 201 : 200).json({
    data: {
      user: result.user,
      accessToken: result.accessToken,
      isNewUser: result.isNewUser,
    },
  });
};

export const getMe = async (_req: Request, res: Response) => {
  const { userId } = getAuthenticatedUser(res);
  const user = await authService.getMe(userId);

  res.status(200).json({
    data: { user },
  });
};
