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

// 기사님의 리뷰 목록 조회 (Swagger: src/docs/review.swagger.yaml)
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

// 리뷰 작성 가능한 견적 조회 (Swagger: src/docs/review.swagger.yaml)
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

// 고객의 리뷰 목록 조회 (Swagger: src/docs/review.swagger.yaml)
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

// 리뷰 등록 (Swagger: src/docs/review.swagger.yaml)
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

// 리뷰 수정 (Swagger: src/docs/review.swagger.yaml)
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

// 리뷰 삭제 — soft delete (Swagger: src/docs/review.swagger.yaml)
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

export default router;
