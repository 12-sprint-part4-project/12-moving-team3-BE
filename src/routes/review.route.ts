import { Router } from 'express';
import { allowUserTypes, requireAuth } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import { quoteIdParamsSchema } from '../schemas/quote.schema';
import {
  reviewBodySchema,
  reviewIdParamsSchema,
  reviewListQuerySchema,
  reviewWritableQuerySchema,
} from '../schemas/review.schema';
import * as reviewController from '../controllers/review.controller';

const router = Router();

//기사님의 리뷰 목록 조회
router.get(
  '/mover',
  requireAuth,
  allowUserTypes('MOVER'),
  validateRequest({
    query: reviewListQuerySchema,
    errorCode: 'INVALID_QUERY_PARAM',
  }),
  reviewController.getMoverReviews
);
//리뷰 작성 가능한 견적 조회
router.get(
  '/customer/writable',
  requireAuth,
  allowUserTypes('CUSTOMER'),
  validateRequest({
    query: reviewWritableQuerySchema,
    errorCode: 'INVALID_QUERY_PARAM',
  }),
  reviewController.getCustomerWritableReviews
);
router.get(
  '/customer',
  requireAuth,
  allowUserTypes('CUSTOMER'),
  validateRequest({
    query: reviewListQuerySchema,
    errorCode: 'INVALID_QUERY_PARAM',
  }),
  reviewController.getCustomerReviews
);

//리뷰 등록
router.post(
  '/quotes/:quoteId',
  requireAuth,
  allowUserTypes('CUSTOMER'),
  validateRequest({
    params: quoteIdParamsSchema,
    body: reviewBodySchema,
    errorCode: 'INVALID_REQUEST_BODY',
  }),
  reviewController.createReview
);
//리뷰 수정
router.patch(
  '/:reviewId',
  requireAuth,
  allowUserTypes('CUSTOMER'),
  validateRequest({
    params: reviewIdParamsSchema,
    body: reviewBodySchema,
    errorCode: 'INVALID_REQUEST_BODY',
  }),
  reviewController.updateReview
);
//리뷰 삭제 (소프트 딜리트)
router.delete(
  '/:reviewId',
  requireAuth,
  allowUserTypes('CUSTOMER'),
  validateRequest({
    params: reviewIdParamsSchema,
    errorCode: 'INVALID_REQUEST',
  }),
  reviewController.deleteReview
);

//리뷰 통계 정보 가져오기 (movers할 때 구현한..) <- 는 repository레이어에서만 구현.

export default router;
