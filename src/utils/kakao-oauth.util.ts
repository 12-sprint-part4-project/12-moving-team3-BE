import env from '../config/env';
import { AppError } from './app.error';

const KAKAO_TOKEN_URL = 'https://kauth.kakao.com/oauth/token';

export interface KakaoTokenResponse {
  accessToken: string;
  tokenType: string;
  refreshToken?: string;
  expiresIn: number;
  refreshTokenExpiresIn?: number;
  scope?: string;
}

interface KakaoTokenApiSuccess {
  access_token: string;
  token_type: string;
  refresh_token?: string;
  expires_in: number;
  refresh_token_expires_in?: number;
  scope?: string;
}

interface KakaoTokenApiError {
  error?: string;
  error_description?: string;
}

/**
 * 인가 코드(code)로 카카오 Access Token을 발급받는다.
 * redirect_uri는 카카오 로그인 요청 때 FE가 사용한 값과 동일해야 한다.
 */
export const exchangeKakaoAuthorizationCode = async (
  code: string
): Promise<KakaoTokenResponse> => {
  if (!env.kakaoRestApiKey || !env.kakaoRedirectUri) {
    throw new AppError('KAKAO_CONFIG_MISSING');
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: env.kakaoRestApiKey,
    redirect_uri: env.kakaoRedirectUri,
    code,
  });

  let response: Response;

  try {
    response = await fetch(KAKAO_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
      body,
    });
  } catch {
    throw new AppError('KAKAO_TOKEN_EXCHANGE_FAILED');
  }

  const payload = (await response.json()) as
    | KakaoTokenApiSuccess
    | KakaoTokenApiError;

  if (!response.ok || !('access_token' in payload) || !payload.access_token) {
    throw new AppError('KAKAO_TOKEN_EXCHANGE_FAILED');
  }

  return {
    accessToken: payload.access_token,
    tokenType: payload.token_type,
    refreshToken: payload.refresh_token,
    expiresIn: payload.expires_in,
    refreshTokenExpiresIn: payload.refresh_token_expires_in,
    scope: payload.scope,
  };
};
