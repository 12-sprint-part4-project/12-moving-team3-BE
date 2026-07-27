import type { NextFunction, Request, Response } from 'express';
import { getAuthenticatedUser } from '../middlewares/auth.middleware';
import type { EstimateRequestListQuery } from '../schemas/estimate-request.schema';
import * as estimateRequestService from '../services/estimate-request.service';
import { AppError } from '../utils/app.error';

/**
 * validateRequest 미들웨어가 남긴 검증·변환된 쿼리 반환
 */
const getValidatedListQuery = (res: Response): EstimateRequestListQuery => {
  const query = res.locals.validated?.query;

  if (query == null || typeof query !== 'object') {
    throw new AppError('INVALID_QUERY_PARAM');
  }

  return query as EstimateRequestListQuery;
};

/**
 * 기사님이 받은 견적 요청 목록 조회
 */
export const getReceivedEstimateRequests = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId: moverId } = getAuthenticatedUser(res);
    const query = getValidatedListQuery(res);

    const result = await estimateRequestService.getReceivedEstimateRequests({
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
