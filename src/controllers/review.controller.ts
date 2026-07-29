import type { NextFunction, Request, Response } from 'express';
import { getAuthenticatedUser } from '../middlewares/auth.middleware';
import type { QuoteIdParams } from '../schemas/quote.schema';
import type {
  ReviewBody,
  ReviewIdParams,
  ReviewListQuery,
  ReviewWritableQuery,
} from '../schemas/review.schema';
import * as reviewService from '../services/review.service';
import { AppError } from '../utils/app.error';

//validateRequest 미들웨어가 남긴 params 반환
const getValidatedParams = <T>(res: Response): T => {
  const params = res.locals.validated?.params;

  if (params == null || typeof params !== 'object') {
    throw new AppError('INVALID_REQUEST');
  }

  return params as T;
};

//validateRequest 미들웨어가 남긴 query 반환
const getValidatedQuery = <T>(res: Response): T => {
  const query = res.locals.validated?.query;

  if (query == null || typeof query !== 'object') {
    throw new AppError('INVALID_QUERY_PARAM');
  }

  return query as T;
};

/** GET /api/review/mover — 기사님의 리뷰 목록 조회 */
export const getMoverReviews = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId: moverId } = getAuthenticatedUser(res);
    const query = getValidatedQuery<ReviewListQuery>(res);

    const result = await reviewService.getMoverReviews({
      moverId,
      ...query,
    });

    res.status(200).json({
      data: { reviews: result.reviews },
      meta: result.meta,
    });
  } catch (error) {
    next(error);
  }
};

/** GET /api/review/customer/writable — 리뷰 작성 가능한 견적 조회 */
export const getCustomerWritableReviews = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId: customerId } = getAuthenticatedUser(res);
    const query = getValidatedQuery<ReviewWritableQuery>(res);

    const result = await reviewService.getCustomerWritableQuotes({
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

/** GET /api/review/customer — 고객의 리뷰 목록 조회 */
export const getCustomerReviews = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId: customerId } = getAuthenticatedUser(res);
    const query = getValidatedQuery<ReviewListQuery>(res);

    const result = await reviewService.getCustomerReviews({
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

/** POST /api/review/quotes/:quoteId — 리뷰 등록 */
export const createReview = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId: customerId } = getAuthenticatedUser(res);
    const { quoteId } = getValidatedParams<QuoteIdParams>(res);
    const body = req.body as ReviewBody;

    const review = await reviewService.createReview({
      customerId,
      quoteId,
      body,
    });

    res.status(201).json({ data: review });
  } catch (error) {
    next(error);
  }
};

/** PATCH /api/review/:reviewId — 리뷰 수정 */
export const updateReview = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId: customerId } = getAuthenticatedUser(res);
    const { reviewId } = getValidatedParams<ReviewIdParams>(res);
    const body = req.body as ReviewBody;

    const review = await reviewService.updateReview({
      customerId,
      reviewId,
      body,
    });

    res.status(200).json({ data: review });
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/review/:reviewId — 리뷰 삭제 (소프트 딜리트) */
export const deleteReview = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId: customerId } = getAuthenticatedUser(res);
    const { reviewId } = getValidatedParams<ReviewIdParams>(res);

    //삭제 실패하면 에러 반환이고, 삭제 성공 시엔 아무런 행동도 하지 않음. (반환값 필요 x)
    await reviewService.deleteReview({ customerId, reviewId });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
