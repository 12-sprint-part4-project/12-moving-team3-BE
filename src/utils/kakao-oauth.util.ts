import env from '../config/env';
import { AppError } from './app.error';

const KAKAO_TOKEN_URL = 'https://kauth.kakao.com/oauth/token';
const KAKAO_USER_ME_URL = 'https://kapi.kakao.com/v2/user/me';

export interface KakaoTokenResponse {
  accessToken: string;
  tokenType: string;
  refreshToken?: string;
  expiresIn: number;
  refreshTokenExpiresIn?: number;
  scope?: string;
}

export interface KakaoUserInfo {
  /** 카카오 회원번호 — AuthAccount.providerAccountId로 사용 */
  id: string;
  email?: string;
  nickname?: string;
  name?: string;
  profileImageUrl?: string;
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

interface KakaoUserMeApiResponse {
  id: number;
  kakao_account?: {
    email?: string;
    name?: string;
    profile?: {
      nickname?: string;
      profile_image_url?: string;
    };
  };
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

  if (env.kakaoClientSecret) {
    body.set('client_secret', env.kakaoClientSecret);
  }

  let response: Response;

  try {
    response = await fetch(KAKAO_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
      body,
    });
  } catch (error) {
    if (env.nodeEnv === 'development') {
      console.error('[kakao] token exchange network error', error);
    }
    throw new AppError('KAKAO_TOKEN_EXCHANGE_FAILED');
  }

  const payload = (await response.json()) as
    | KakaoTokenApiSuccess
    | KakaoTokenApiError;

  if (!response.ok || !('access_token' in payload) || !payload.access_token) {
    if (env.nodeEnv === 'development') {
      const kakaoError = payload as KakaoTokenApiError;
      console.error('[kakao] token exchange failed', {
        status: response.status,
        error: kakaoError.error,
        error_description: kakaoError.error_description,
        redirect_uri: env.kakaoRedirectUri,
      });
    }
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

/**
 * 카카오 Access Token으로 사용자 정보(회원번호·이메일·닉네임 등)를 조회한다.
 */
export const fetchKakaoUserInfo = async (
  accessToken: string
): Promise<KakaoUserInfo> => {
  let response: Response;

  try {
    response = await fetch(KAKAO_USER_ME_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
    });
  } catch (error) {
    if (env.nodeEnv === 'development') {
      console.error('[kakao] user info network error', error);
    }
    throw new AppError('KAKAO_USER_INFO_FAILED');
  }

  if (!response.ok) {
    if (env.nodeEnv === 'development') {
      const errorBody = await response.text();
      console.error('[kakao] user info failed', {
        status: response.status,
        body: errorBody,
      });
    }
    throw new AppError('KAKAO_USER_INFO_FAILED');
  }

  const payload = (await response.json()) as KakaoUserMeApiResponse;

  if (typeof payload.id !== 'number') {
    if (env.nodeEnv === 'development') {
      console.error('[kakao] user info missing id', payload);
    }
    throw new AppError('KAKAO_USER_INFO_FAILED');
  }

  const account = payload.kakao_account;

  return {
    id: String(payload.id),
    email: account?.email,
    nickname: account?.profile?.nickname,
    name: account?.name,
    profileImageUrl: account?.profile?.profile_image_url,
  };
};
