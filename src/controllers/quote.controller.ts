import type { NextFunction, Request, Response } from 'express';
import { getAuthenticatedUser } from '../middlewares/auth.middleware';
import type {
  QuoteBody,
  QuoteIdParams,
  QuoteListQuery,
  QuoteParams,
} from '../schemas/quote.schema';
import * as quoteService from '../services/quote.service';
import { AppError } from '../utils/app.error';

/**
 * validateRequest 미들웨어가 남긴 params 반환
 */
const getValidatedParams = <T>(res: Response): T => {
  const params = res.locals.validated?.params;

  if (params == null || typeof params !== 'object') {
    throw new AppError('INVALID_REQUEST_BODY');
  }

  return params as T;
};

/**
 * validateRequest 미들웨어가 남긴 쿼리 반환
 */
const getValidatedListQuery = (res: Response): QuoteListQuery => {
  const query = res.locals.validated?.query;

  if (query == null || typeof query !== 'object') {
    throw new AppError('INVALID_QUERY_PARAM');
  }

  return query as QuoteListQuery;
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
    const { estimateRequestId } = getValidatedParams<QuoteParams>(res);
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

/**
 * 견적 상세 조회
 */
export const getQuoteDetail = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId: moverId } = getAuthenticatedUser(res);
    const { quoteId } = getValidatedParams<QuoteIdParams>(res);

    const data = await quoteService.getQuoteDetail({ moverId, quoteId });

    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
};

/**
 * 보낸 견적 / 반려한 견적 목록 조회
 */
export const getQuotes = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId: moverId } = getAuthenticatedUser(res);
    const query = getValidatedListQuery(res);

    const result = await quoteService.getQuotes({
      moverId,
      ...query,
    });

    // data.items / meta 분리 응답
    res.status(200).json({
      data: { items: result.items },
      meta: result.meta,
    });
  } catch (error) {
    next(error);
  }
};
