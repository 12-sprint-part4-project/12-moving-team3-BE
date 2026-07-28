import type { NextFunction, Request, Response } from 'express';
import { getAuthenticatedUser } from '../middlewares/auth.middleware';
import {
  quoteBodySchema,
  quoteParamsSchema,
  type QuoteBody,
  type QuoteParams,
} from '../schemas/quote.schema';
import * as quoteService from '../services/quote.service';
import { AppError } from '../utils/app.error';

/**
 * validateRequest 미들웨어가 남긴 params 재검증 후 타입 반환
 */
const getValidatedParams = (res: Response): QuoteParams => {
  const parsed = quoteParamsSchema.safeParse(res.locals.validated?.params);

  if (!parsed.success) {
    throw new AppError('INVALID_REQUEST_BODY');
  }

  return parsed.data;
};

/**
 * validateRequest 미들웨어가 남긴 body 재검증 후 타입 반환
 */
const getValidatedBody = (req: Request): QuoteBody => {
  const parsed = quoteBodySchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError('INVALID_REQUEST_BODY');
  }

  return parsed.data;
};

/**
 * 견적 보내기 / 반려하기 요청 처리
 */
export const submitQuote = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId: moverId } = getAuthenticatedUser(res);
    const { estimateRequestId } = getValidatedParams(res);
    const body = getValidatedBody(req);

    const quote = await quoteService.submitQuote({
      moverId,
      estimateRequestId,
      body,
    });

    res.status(201).json({
      data: quote,
    });
  } catch (error) {
    next(error);
  }
};
