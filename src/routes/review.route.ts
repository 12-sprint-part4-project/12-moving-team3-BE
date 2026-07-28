import { Router } from 'express';
import { allowUserTypes, requireAuth } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import { quoteIdParamsSchema } from '../schemas/quote.schema';
import {
  reviewBodySchema,
  reviewIdParamsSchema,
  reviewListQuerySchema,
} from '../schemas/review.schema';

const router = Router();

//기사님의 리뷰 목록 조회
router.get(
  '/mover',
  requireAuth,
  allowUserTypes('MOVER'),
  validateRequest({
    query: reviewListQuerySchema,
    errorCode: 'INVALID_QUERY_PARAM',
  })
);
//리뷰 작성 가능한 견적 조회
router.get(
  '/customer/writable',
  requireAuth,
  allowUserTypes('CUSTOMER'),
  validateRequest({
    query: reviewListQuerySchema,
    errorCode: 'INVALID_QUERY_PARAM',
  })
);
//고객의 리뷰 목록 조회
router.get(
  '/customer',
  requireAuth,
  allowUserTypes('CUSTOMER'),
  validateRequest({
    query: reviewListQuerySchema,
    errorCode: 'INVALID_QUERY_PARAM',
  })
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
  })
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
  })
);
//리뷰 삭제 (소프트 딜리트)
router.delete(
  '/:reviewId',
  requireAuth,
  allowUserTypes('CUSTOMER'),
  validateRequest({
    params: reviewIdParamsSchema,
    errorCode: 'INVALID_REQUEST',
  })
);

//리뷰 통계 정보 가져오기 (movers할 때 구현한..)

export default router;
