import { Router } from 'express';
import * as estimateRequestController from '../controllers/estimate-request.controller';
import * as moverProfileController from '../controllers/mover-profile.controller';
import * as quoteController from '../controllers/quote.controller';
import { validateRequest } from '../middlewares/validate.middleware';
import {
  moverBasicInfoBodySchema,
  moverProfileBodySchema,
} from '../schemas/mover-profile.schema';
import { estimateRequestListQuerySchema } from '../schemas/estimate-request.schema';
import {
  quoteBodySchema,
  quoteIdParamsSchema,
  quoteListQuerySchema,
  quoteParamsSchema,
} from '../schemas/quote.schema';
import { allowUserTypes, requireAuth, requireAuthAllowSuspended } from '../middlewares/auth.middleware';
import { requireCompletedMoverProfile } from '../middlewares/profile.middleware';
import { passwordChangeRateLimit } from '../middlewares/rate-limit.middleware';

const router = Router();

// 기사님 본인 프로필 조회 — 헤더용, 정지 유저도 허용
// (Swagger: src/docs/mover-profile.swagger.yaml)
router.get(
  '/profile',
  requireAuthAllowSuspended,
  allowUserTypes('MOVER'),
  moverProfileController.getMoverProfile
);

// 기사님 프로필 등록/수정 — 정지 유저도 허용
// (Swagger: src/docs/mover-profile.swagger.yaml)
router.patch(
  '/profile',
  requireAuthAllowSuspended,
  allowUserTypes('MOVER'),
  validateRequest({
    body: moverProfileBodySchema,
    errorCode: 'INVALID_REQUEST_BODY',
  }),
  moverProfileController.saveMoverProfile
);

// 기사님 기본정보 수정 — 정지 유저도 허용
// (Swagger: src/docs/mover-profile.swagger.yaml)
router.patch(
  '/basic-info',
  requireAuthAllowSuspended,
  allowUserTypes('MOVER'),
  validateRequest({
    body: moverBasicInfoBodySchema,
    errorCode: 'INVALID_REQUEST_BODY',
  }),
  passwordChangeRateLimit,
  moverProfileController.updateMoverBasicInfo
);

// 기사님이 받은 견적 요청 목록 조회 (Swagger 문서: src/docs/mover.swagger.yaml)
// 인증 → MOVER → 프로필 등록 완료 순으로 통과
router.get(
  '/estimate-requests',
  requireAuth,
  allowUserTypes('MOVER'),
  requireCompletedMoverProfile,
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
  requireCompletedMoverProfile,
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
  requireCompletedMoverProfile,
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
  requireCompletedMoverProfile,
  validateRequest({
    params: quoteIdParamsSchema,
    errorCode: 'INVALID_REQUEST',
  }),
  quoteController.getQuoteDetail
);
export default router;
