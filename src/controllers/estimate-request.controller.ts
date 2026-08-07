import type { NextFunction, Request, Response } from 'express';
import { getAuthenticatedUser } from '../middlewares/auth.middleware';
import type {
  EstimateRequestIdParams,
  EstimateRequestListQuery,
  ReviseEstimateRequestFieldBody,
  SaveEstimateRequestStepBody,
} from '../schemas/estimate-request.schema';
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
 * validateRequest 미들웨어가 남긴 path params 반환
 */
const getValidatedIdParams = (res: Response): EstimateRequestIdParams => {
  const params = res.locals.validated?.params;

  if (params == null || typeof params !== 'object') {
    throw new AppError('INVALID_REQUEST');
  }

  return params as EstimateRequestIdParams;
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

// --- 일반 유저 견적요청 (DRAFT → SUBMITTED) ---

/**
 * GET /api/estimate-requests/active — 활성 견적요청 조회
 */
export const getActiveEstimateRequest = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = getAuthenticatedUser(res);
    const data = await estimateRequestService.getActiveEstimateRequest(userId);

    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/estimate-requests — DRAFT 견적요청 생성
 */
export const createEstimateRequest = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = getAuthenticatedUser(res);
    const data = await estimateRequestService.createEstimateRequest(userId);

    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/estimate-requests/:estimateRequestId — 상세 조회
 */
export const getEstimateRequestDetail = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = getAuthenticatedUser(res);
    const { estimateRequestId } = getValidatedIdParams(res);
    const data = await estimateRequestService.getEstimateRequestDetail(
      estimateRequestId,
      userId
    );

    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/estimate-requests/:estimateRequestId/step — 단계별 입력 저장
 */
export const saveEstimateRequestStep = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = getAuthenticatedUser(res);
    const { estimateRequestId } = getValidatedIdParams(res);
    const body = req.body as SaveEstimateRequestStepBody;
    const data = await estimateRequestService.saveEstimateRequestStep(
      estimateRequestId,
      userId,
      body
    );

    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/estimate-requests/:estimateRequestId/field — 완료 항목 재수정
 */
export const reviseEstimateRequestField = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = getAuthenticatedUser(res);
    const { estimateRequestId } = getValidatedIdParams(res);
    const body = req.body as ReviseEstimateRequestFieldBody;
    const data = await estimateRequestService.reviseEstimateRequestField(
      estimateRequestId,
      userId,
      body
    );

    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/estimate-requests/:estimateRequestId/submit — 견적요청 제출
 */
export const submitEstimateRequest = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = getAuthenticatedUser(res);
    const { estimateRequestId } = getValidatedIdParams(res);
    const data = await estimateRequestService.submitEstimateRequest(
      estimateRequestId,
      userId
    );

    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
};
