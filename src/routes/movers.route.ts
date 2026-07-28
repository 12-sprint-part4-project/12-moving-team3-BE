import { Router } from 'express';

import * as moversController from '../controllers/movers.controller';
import { validateRequest } from '../middlewares/validate.middleware';
import {
  favoriteMoversQuerySchema,
  moverDetailParamsSchema,
  moversListQuerySchema,
} from '../schemas/movers.schema';
import { allowUserTypes, requireAuth } from '../middlewares/auth.middleware';

const router = Router();

// 기사님 목록 조회 (회원/비회원 모두 접근 가능)
// (Swagger 문서: src/docs/movers.swagger.yaml)
router.get(
  '/',
  validateRequest({
    query: moversListQuerySchema,
    errorCode: 'INVALID_QUERY_PARAM',
  }),
  moversController.getMovers
);

// 찜한 기사님 목록 조회 (로그인한 customer만 접근 가능)
//TODO: Swagger 문서 추가
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

// 기사님 상세 조회 (회원/비회원 모두 접근 가능)
// (Swagger 문서: src/docs/movers.swagger.yaml)
router.get(
  '/:id',
  validateRequest({
    params: moverDetailParamsSchema,
    errorCode: 'INVALID_QUERY_PARAM',
  }),
  moversController.getMoverDetail
);

export default router;
