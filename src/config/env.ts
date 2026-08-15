import 'dotenv/config';

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 8000,
  databaseUrl: process.env.DATABASE_URL,
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:8000',
  corsOrigin:
    process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:3001',
  // 카카오 OAuth — redirect_uri는 FE authorize 요청과 반드시 동일해야 한다.
  // Client Secret 활성화 시 kakaoClientSecret 필수.
  kakaoRestApiKey: process.env.KAKAO_REST_API_KEY ?? '',
  kakaoRedirectUri: process.env.KAKAO_REDIRECT_URI ?? '',
  kakaoClientSecret: process.env.KAKAO_CLIENT_SECRET ?? '',
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  bannedWordSimilarityThreshold: Number(
    process.env.BANNED_WORD_SIMILARITY_THRESHOLD
  ),
};

export default env;
