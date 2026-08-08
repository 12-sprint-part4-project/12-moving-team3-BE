import type { NextFunction, Request, RequestHandler, Response } from 'express';
import {
  auditContextStorage,
  type AuditContextStore,
} from '../lib/request-context';

/**
 * 요청마다 Audit Context 스토어를 연다.
 * Express는 next() 이후 async로 이어지므로 run(() => next())만으로는
 * await/Prisma 시점에 getStore()가 비는 경우가 있다.
 * enterWith로 현재 요청 async 리소스에 스토어를 고정한다.
 */
export const requestContextMiddleware: RequestHandler = (
  _req: Request,
  _res: Response,
  next: NextFunction
) => {
  const store: AuditContextStore = {};
  auditContextStorage.enterWith(store);
  next();
};
