import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { auditContextStorage } from '../lib/request-context';

/**
 * 요청마다 빈 Audit Context 스토어를 만들고 이후 async 체인에 전파한다.
 * actor 값은 auth / admin-auth 미들웨어에서 채운다.
 */
export const requestContextMiddleware: RequestHandler = (
  _req: Request,
  _res: Response,
  next: NextFunction
) => {
  auditContextStorage.run({}, () => {
    next();
  });
};
