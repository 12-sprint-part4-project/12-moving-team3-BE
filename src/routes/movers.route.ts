import { Router } from 'express';

import * as moversController from '../controllers/movers.controller';
import { validateRequest } from '../middlewares/validate.middleware';
import {
  moverDetailParamsSchema,
  moversListQuerySchema,
} from '../schemas/movers.schema';

const router = Router();

// 기사님 목록 조회 (Swagger 문서: src/docs/movers.swagger.yaml)
router.get(
  '/',
  validateRequest({
    query: moversListQuerySchema,
    errorCode: 'INVALID_QUERY_PARAM',
  }),
  moversController.getMovers
);

// 기사님 상세 조회 (Swagger 문서: src/docs/movers.swagger.yaml)
router.get(
  '/:id',
  validateRequest({
    params: moverDetailParamsSchema,
    errorCode: 'INVALID_QUERY_PARAM',
  }),
  moversController.getMoverDetail
);

export default router;
