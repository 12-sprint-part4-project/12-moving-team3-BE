import { rateLimit, type RateLimitExceededEventHandler } from 'express-rate-limit';
import { AppError } from '../utils/app.error';

const sendTooManyRequests: RateLimitExceededEventHandler = (
  _req,
  _res,
  next
) => {
  next(new AppError('TOO_MANY_REQUESTS'));
};

/** 유저·카카오·관리자 로그인. 실패한 시도만 집계한다. */
export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  handler: sendTooManyRequests,
});

/** newPassword가 있는 프로필/기본정보 수정만 제한 */
export const passwordChangeRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skip: (_req, res) => {
    const body = res.locals.validated?.body as
      | { newPassword?: unknown }
      | undefined;

    return body?.newPassword === undefined;
  },
  handler: sendTooManyRequests,
});
