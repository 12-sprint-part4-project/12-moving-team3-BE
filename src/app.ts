import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { SWAGGER_BASE_URL, swaggerSpec } from './config/swagger';
import { errorHandler } from './middlewares/error.handler';
import adminAuthRouter from './routes/admin-auth.route';
import moverRouter from './routes/mover.route';
import chatRouter from './routes/chat.route';
import authRouter from './routes/auth.route';
import testRouter from './routes/test.route';

const app = express();

const corsOrigins = (process.env.CORS_ORIGIN ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(helmet());

// 관리자 FE는 BE와 origin이 달라, credentials 요청에서 쿠키를 받으려면 허용 origin이 필요하다.
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    credentials: true,
  })
);

app.use(express.json());

// Swagger 문서 - 프로덕션 배포 시에는 노출 X
if (process.env.NODE_ENV !== 'production') {
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      swaggerOptions: {
        // 기본 credentials=omit이면 브라우저가 Set-Cookie를 저장하지 않는다.
        withCredentials: true,
        requestInterceptor: (req: { credentials?: string }) => {
          req.credentials = 'include';
          return req;
        },
      },
    })
  );
}

app.use('/', testRouter);
app.use('/api/auth', authRouter);
app.use('/api/admin/auth', adminAuthRouter);
app.use('/api/users/movers', moverRouter);
app.use('/api/chat', chatRouter);

app.use(errorHandler);

app.listen(3000, () => {
  console.log('Server is running on port 3000');
  if (process.env.NODE_ENV !== 'production') {
    console.log(`Swagger docs: ${SWAGGER_BASE_URL}/api-docs`);
  }
});
