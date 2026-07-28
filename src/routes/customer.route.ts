import { Router } from 'express';
import * as quoteController from '../controllers/quote.controller';
import { allowUserTypes, requireAuth } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import {
  pastQuotesQuerySchema,
  quoteIdParamsSchema,
} from '../schemas/quote.schema';

const router = Router();

// 대기 중인 견적 리스트 조회 (Swagger: src/docs/customer-quote.swagger.yaml)
router.get(
  '/quotes',
  requireAuth,
  allowUserTypes('CUSTOMER'),
  quoteController.getCustomerPendingQuotes
);

// 받았던 견적(과거) 리스트 조회 (Swagger: src/docs/customer-quote.swagger.yaml)
router.get(
  '/past-quotes',
  requireAuth,
  allowUserTypes('CUSTOMER'),
  validateRequest({
    query: pastQuotesQuerySchema,
    errorCode: 'INVALID_QUERY_PARAM',
  }),
  quoteController.getCustomerPastQuotes
);

// 대기 중 / 받았던 견적 상세 조회 (Swagger: src/docs/customer-quote.swagger.yaml)
router.get(
  '/quotes/:quoteId',
  requireAuth,
  allowUserTypes('CUSTOMER'),
  validateRequest({
    params: quoteIdParamsSchema,
    errorCode: 'INVALID_REQUEST',
  }),
  quoteController.getCustomerQuoteDetail
);

export default router;
