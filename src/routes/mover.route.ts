import { Router } from 'express';
import * as estimateRequestController from '../controllers/estimate-request.controller';
import { validateRequest } from '../middlewares/validate.middleware';
import { estimateRequestListQuerySchema } from '../schemas/estimate-request.schema';
import { allowUserTypes, requireAuth } from '../middlewares/auth.middleware';

const router = Router();

// 기사님이 받은 견적 요청 목록 조회 (Swagger 문서: src/docs/mover.swagger.yaml)
router.get(
  '/estimate-requests',
  requireAuth,
  allowUserTypes('MOVER'),
  validateRequest({
    query: estimateRequestListQuerySchema,
    errorCode: 'INVALID_QUERY_PARAM',
  }),
  estimateRequestController.getReceivedEstimateRequests
);

export default router;
