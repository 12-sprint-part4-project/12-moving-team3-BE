import type { NextFunction, Request, Response } from 'express';
import { getAuthenticatedUser } from '../middlewares/auth.middleware';
import type { QuoteBody, QuoteParams } from '../schemas/quote.schema';
import * as quoteService from '../services/quote.service';
import { AppError } from '../utils/app.error';

/**
 * validateRequest 미들웨어가 남긴 params 반환
 */
const getValidatedParams = (res: Response): QuoteParams => {
  const params = res.locals.validated?.params;

  if (params == null || typeof params !== 'object') {
    throw new AppError('INVALID_REQUEST_BODY');
  }

  return params as QuoteParams;
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
    const body = req.body as QuoteBody;

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
