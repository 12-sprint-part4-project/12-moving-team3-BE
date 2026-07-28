import { Router } from 'express';
import * as estimateRequestController from '../controllers/estimate-request.controller';
import * as quoteController from '../controllers/quote.controller';
import { validateRequest } from '../middlewares/validate.middleware';
import { estimateRequestListQuerySchema } from '../schemas/estimate-request.schema';
import {
  quoteBodySchema,
  quoteIdParamsSchema,
  quoteListQuerySchema,
  quoteParamsSchema,
} from '../schemas/quote.schema';
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

// 견적 보내기 / 반려하기 (Swagger 문서: src/docs/mover.swagger.yaml)
router.post(
  '/estimate-requests/:estimateRequestId/quotes',
  requireAuth,
  allowUserTypes('MOVER'),
  validateRequest({
    params: quoteParamsSchema,
    body: quoteBodySchema,
    errorCode: 'INVALID_REQUEST_BODY',
  }),
  quoteController.submitQuote
);

// 보낸 견적 / 반려한 견적 목록 조회 (Swagger 문서: src/docs/mover.swagger.yaml)
router.get(
  '/quotes',
  requireAuth,
  allowUserTypes('MOVER'),
  validateRequest({
    query: quoteListQuerySchema,
    errorCode: 'INVALID_QUERY_PARAM',
  }),
  quoteController.getQuotes
);

// 견적 상세 조회 (Swagger 문서: src/docs/mover.swagger.yaml)
router.get(
  '/quotes/:quoteId',
  requireAuth,
  allowUserTypes('MOVER'),
  validateRequest({
    params: quoteIdParamsSchema,
    errorCode: 'INVALID_REQUEST',
  }),
  quoteController.getQuoteDetail
);
export default router;
