import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import {
  estimateRequestListQuerySchema,
  type EstimateRequestListQuery,
} from '../schemas/estimate-request.schema';
import * as estimateRequestService from '../services/estimate-request.service';
import { AppError } from '../utils/app.error';

// 인증/인가 미들웨어 연결 전까지, 기사 식별을 위한 임시 헤더
const moverIdHeaderSchema = z.uuid();

/**
 * x-mover-id 헤더에서 기사 UUID 를 추출한다.
 * 헤더가 없거나 UUID 형식이 아니면 인증되지 않은 요청으로 간주한다.
 *
 * 인증/인가 미들웨어 연결 후 아래 함수는 제거하고
 * authenticate 미들웨어가 주입한 req.user.id 를 사용
 */
const getMoverIdFromHeader = (req: Request): string => {
  const headerValue = req.headers['x-mover-id'];
  const rawMoverId = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  const parsed = moverIdHeaderSchema.safeParse(rawMoverId);

  if (!parsed.success) {
    throw new AppError('UNAUTHORIZED');
  }

  return parsed.data;
};

/**
 * validateRequest 미들웨어가 남긴 검증 결과를 스키마로 재확인해 타입 반환
 */
const getValidatedListQuery = (res: Response): EstimateRequestListQuery => {
  const parsed = estimateRequestListQuerySchema.safeParse(
    res.locals.validated?.query
  );

  if (!parsed.success) {
    throw new AppError('INVALID_QUERY_PARAM');
  }

  return parsed.data;
};

/**
 * 기사님이 받은 견적 요청 목록 조회
 */
export const getReceivedEstimateRequests = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // 인증/인가 미들웨어 구현 후 주석 해제하고 아래 임시 헤더 로직은 제거
    // const moverId = req.user?.id;
    // if (!moverId) {
    //   throw new AppError('UNAUTHORIZED');
    // }
    const moverId = getMoverIdFromHeader(req);
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
