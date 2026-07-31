import 'dotenv/config';

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 8000,
  databaseUrl: process.env.DATABASE_URL,
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:8000',
  corsOrigin:
    process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:3001',
};

export default env;
