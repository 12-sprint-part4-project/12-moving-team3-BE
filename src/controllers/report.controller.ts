import type { NextFunction, Request, Response } from 'express';
import { getAuthenticatedUser } from '../middlewares/auth.middleware';
import type { ReportCreateBody } from '../schemas/report.schema';
import * as reportService from '../services/report.service';
import { AppError } from '../utils/app.error';

const getValidatedBody = <T>(res: Response): T => {
  const body = res.locals.validated?.body;

  if (body == null || typeof body !== 'object') {
    throw new AppError('INVALID_REQUEST_BODY');
  }

  return body as T;
};

/** POST /api/reports — 신고 등록 */
export const createReport = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId: reporterId } = getAuthenticatedUser(res);
    const body = getValidatedBody<ReportCreateBody>(res);

    const report = await reportService.createReport({ reporterId, body });

    res.status(201).json({ data: report });
  } catch (error) {
    next(error);
  }
};
