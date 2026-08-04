import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import http from 'http';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import env from './config/env';
import { swaggerSpec } from './config/swagger';
import { startExpireSubmittedEstimateRequestsCron } from './jobs/expire-submitted-estimate-requests.job';
import { startMoveDayReminderCron } from './jobs/move-day-reminder.job';
import { startReleaseExpiredSuspensionsCron } from './jobs/release-expired-suspensions.job';
import { errorHandler } from './middlewares/error.handler';
import adminAuthRouter from './routes/admin-auth.route';
import adminCompletedRouter from './routes/admin-completed.route';
import adminDashboardRouter from './routes/admin-dashboard.route';
import adminEstimateRequestRouter from './routes/admin-estimate-request.route';
import adminMemberRouter from './routes/admin-member.route';
import adminReportRouter from './routes/admin-report.route';
import adminReviewRouter from './routes/admin-review.route';
import authRouter from './routes/auth.route';
import chatRouter from './routes/chat.route';
import communityRouter from './routes/community.route';
import customerRouter from './routes/customer.route';
import estimateRequestRouter from './routes/estimate-request.route';
import favoritesRouter from './routes/favorites.route';
import moverRouter from './routes/mover.route';
import moversRouter from './routes/movers.route';
import notificationRouter from './routes/notification.route';
import presignedUrlRouter from './routes/presigned-url.route';
import reportRouter from './routes/report.route';
import reviewRouter from './routes/review.route';
import testRouter from './routes/test.route';
import { initChatSocket } from './sockets';

const app = express();
const httpServer = http.createServer(app);

const corsOrigins = (env.corsOrigin ?? '')
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
// Cookie Header를 req.cookies로 파싱해 Refresh Token을 안전하게 읽게 한다.
app.use(cookieParser());

// Swagger 문서 - 프로덕션 배포 시에는 노출 X
if (env.nodeEnv !== 'production') {
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
app.use('/api/posts', communityRouter);
app.use('/api/admin/auth', adminAuthRouter);
app.use('/api/admin/dashboard', adminDashboardRouter);
app.use('/api/admin/estimate-request', adminEstimateRequestRouter);
app.use('/api/admin/completed', adminCompletedRouter);
app.use('/api/admin/members', adminMemberRouter);
app.use('/api/admin/reviews', adminReviewRouter);
app.use('/api/admin/reports', adminReportRouter);
app.use('/api/movers', moversRouter);
app.use('/api/favorites', favoritesRouter);
app.use('/api/users/customers', customerRouter);
app.use('/api/estimate-requests', estimateRequestRouter);
app.use('/api/users/movers', moverRouter);
app.use('/api/chat', chatRouter);
app.use('/api/review', reviewRouter);
app.use('/api/reports', reportRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api', presignedUrlRouter);

app.use(errorHandler);

initChatSocket(httpServer);

httpServer.listen(env.port, () => {
  console.log(`Server is running on port ${env.port}`);
  if (env.nodeEnv !== 'production') {
    console.log(`Swagger docs: ${env.apiBaseUrl}/api-docs`);
  }
  // 이사 전날 리마인더 배치 (매일 09:00 Asia/Seoul)
  startMoveDayReminderCron();
  // 만료된 정지 자동 해제 배치 (매일 00:05 Asia/Seoul)
  startReleaseExpiredSuspensionsCron();
  // 미확정(SUBMITTED) 견적 요청 만료 배치 (매일 00:00 Asia/Seoul)
  startExpireSubmittedEstimateRequestsCron();
});

