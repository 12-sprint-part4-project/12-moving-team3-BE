import { Router } from 'express';
import * as customerProfileController from '../controllers/customer-profile.controller';
import * as quoteController from '../controllers/quote.controller';
import { allowUserTypes, requireAuth, requireAuthAllowSuspended } from '../middlewares/auth.middleware';
import { requireCompletedCustomerProfile } from '../middlewares/profile.middleware';
import { passwordChangeRateLimit } from '../middlewares/rate-limit.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import { customerProfileBodySchema } from '../schemas/customer-profile.schema';
import {
  pastQuotesQuerySchema,
  quoteIdParamsSchema,
} from '../schemas/quote.schema';

const router = Router();

// 일반 유저 본인 프로필 조회 — 헤더용, 정지 유저도 허용
// (Swagger: src/docs/customer-profile.swagger.yaml)
router.get(
  '/profile',
  requireAuthAllowSuspended,
  allowUserTypes('CUSTOMER'),
  customerProfileController.getCustomerProfile
);

// 일반 유저 프로필 등록/수정 — 정지 유저도 허용
// (Swagger: src/docs/customer-profile.swagger.yaml)
router.patch(
  '/profile',
  requireAuthAllowSuspended,
  allowUserTypes('CUSTOMER'),
  validateRequest({
    body: customerProfileBodySchema,
    errorCode: 'INVALID_REQUEST_BODY',
  }),
  passwordChangeRateLimit,
  customerProfileController.registerCustomerProfile
);

// 대기 중인 견적 리스트 조회 — 정지 유저도 조회 허용
// (Swagger: src/docs/customer-quote.swagger.yaml)
router.get(
  '/quotes',
  requireAuthAllowSuspended,
  allowUserTypes('CUSTOMER'),
  requireCompletedCustomerProfile,
  quoteController.getCustomerPendingQuotes
);

// 받았던 견적(과거) 리스트 조회 — 정지 유저도 조회 허용
// (Swagger: src/docs/customer-quote.swagger.yaml)
router.get(
  '/past-quotes',
  requireAuthAllowSuspended,
  allowUserTypes('CUSTOMER'),
  requireCompletedCustomerProfile,
  validateRequest({
    query: pastQuotesQuerySchema,
    errorCode: 'INVALID_QUERY_PARAM',
  }),
  quoteController.getCustomerPastQuotes
);

// 대기 중 / 받았던 견적 상세 조회 — 정지 유저도 조회 허용
// (Swagger: src/docs/customer-quote.swagger.yaml)
router.get(
  '/quotes/:quoteId',
  requireAuthAllowSuspended,
  allowUserTypes('CUSTOMER'),
  requireCompletedCustomerProfile,
  validateRequest({
    params: quoteIdParamsSchema,
    errorCode: 'INVALID_REQUEST',
  }),
  quoteController.getCustomerQuoteDetail
);

// 견적 확정하기 (Swagger: src/docs/customer-quote.swagger.yaml)
router.patch(
  '/quotes/:quoteId',
  requireAuth,
  allowUserTypes('CUSTOMER'),
  requireCompletedCustomerProfile,
  validateRequest({
    params: quoteIdParamsSchema,
    errorCode: 'INVALID_REQUEST',
  }),
  quoteController.confirmQuote
);

export default router;
