import type { NextFunction, Request, Response } from 'express';
import { getAuthenticatedUser } from '../middlewares/auth.middleware';
import type {
  PastQuotesQuery,
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
 * validateRequest 미들웨어가 남긴 query 반환
 */
const getValidatedQuery = <T>(res: Response): T => {
  const query = res.locals.validated?.query;

  if (query == null || typeof query !== 'object') {
    throw new AppError('INVALID_QUERY_PARAM');
  }

  return query as T;
};

// --- [기사님(MOVER)용 API] ---

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
    const query = getValidatedQuery<QuoteListQuery>(res);

    const result = await quoteService.getQuotes({
      moverId,
      ...query,
    });

    res.status(200).json({
      data: { items: result.items },
      meta: result.meta,
    });
  } catch (error) {
    next(error);
  }
};

// --- [일반 유저(CUSTOMER)용 API] ---

/**
 * 대기 중인 견적 리스트 조회
 */
export const getCustomerPendingQuotes = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId: customerId } = getAuthenticatedUser(res);
    const data = await quoteService.getCustomerPendingQuotes(customerId);

    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
};

/**
 * 받았던 견적(과거) 리스트 조회
 */
export const getCustomerPastQuotes = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId: customerId } = getAuthenticatedUser(res);
    const query = getValidatedQuery<PastQuotesQuery>(res);

    const result = await quoteService.getCustomerPastQuotes({
      customerId,
      ...query,
    });

    res.status(200).json({
      data: { items: result.items },
      meta: result.meta,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 고객 견적 상세 조회
 */
export const getCustomerQuoteDetail = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId: customerId } = getAuthenticatedUser(res);
    const { quoteId } = getValidatedParams<QuoteIdParams>(res);

    const data = await quoteService.getCustomerQuoteDetail({
      customerId,
      quoteId,
    });

    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
};

/**
 * 견적 확정
 */
export const confirmQuote = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId: customerId } = getAuthenticatedUser(res);
    const { quoteId } = getValidatedParams<QuoteIdParams>(res);

    const data = await quoteService.confirmQuote({ customerId, quoteId });

    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
};
