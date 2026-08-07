import { Router } from 'express';

import * as moversController from '../controllers/movers.controller';
import { validateRequest } from '../middlewares/validate.middleware';
import {
  favoriteMoversQuerySchema,
  moverDetailParamsSchema,
  moversListQuerySchema,
} from '../schemas/movers.schema';
import { reviewListQuerySchema } from '../schemas/review.schema';
import {
  allowUserTypes,
  optionalAuth,
  requireAuth,
} from '../middlewares/auth.middleware';

const router = Router();

// 기사님 목록 조회 (회원/비회원 모두 접근 가능)
// 로그인 CUSTOMER면 각 항목에 isFavorited 반영 (비회원·기사는 false)
// (Swagger 문서: src/docs/movers.swagger.yaml)
router.get(
  '/',
  optionalAuth,
  validateRequest({
    query: moversListQuerySchema,
    errorCode: 'INVALID_QUERY_PARAM',
  }),
  moversController.getMovers
);

// 찜한 기사님 목록 조회 (로그인한 customer만 접근 가능)
// (Swagger 문서: src/docs/movers.swagger.yaml)
router.get(
  '/favorites',
  requireAuth,
  allowUserTypes('CUSTOMER'),
  validateRequest({
    query: favoriteMoversQuerySchema,
    errorCode: 'INVALID_QUERY_PARAM',
  }),
  moversController.getFavoriteMovers
);

// 기사 상세용 공개 리뷰 목록 (회원/비회원 모두 접근 가능)
// /:id 보다 먼저 등록해 path 매칭을 명확히 한다.
// (Swagger 문서: src/docs/movers.swagger.yaml)
router.get(
  '/:id/reviews',
  validateRequest({
    params: moverDetailParamsSchema,
    query: reviewListQuerySchema,
    errorCode: 'INVALID_QUERY_PARAM',
  }),
  moversController.getMoverPublicReviews
);

// 기사님 상세 조회 (회원/비회원 모두 접근 가능)
// 로그인 CUSTOMER면 isFavorited 반영 (비회원·기사는 false)
// (Swagger 문서: src/docs/movers.swagger.yaml)
router.get(
  '/:id',
  optionalAuth,
  validateRequest({
    params: moverDetailParamsSchema,
    errorCode: 'INVALID_QUERY_PARAM',
  }),
  moversController.getMoverDetail
);

export default router;
