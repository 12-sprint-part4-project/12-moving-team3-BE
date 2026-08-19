import { Router } from 'express';
import * as estimateRequestController from '../controllers/estimate-request.controller';
import {
  allowUserTypes,
  requireAuth,
  requireAuthAllowSuspended,
} from '../middlewares/auth.middleware';
import { requireCompletedCustomerProfile } from '../middlewares/profile.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import {
  estimateRequestIdParamsSchema,
  reviseEstimateRequestFieldBodySchema,
  saveEstimateRequestStepBodySchema,
} from '../schemas/estimate-request.schema';

const router = Router();

// 요청 생명주기 API를 견적제안/반려 라우트보다 상단에 배치
// (정적 경로 /active 가 /:estimateRequestId 보다 먼저 등록되어야 함)
// Swagger: src/docs/estimate-request.swagger.yaml
// 고객 견적요청: 인증 → CUSTOMER → 프로필 등록 완료 순으로 통과

router.get(
  '/active',
  requireAuthAllowSuspended,
  allowUserTypes('CUSTOMER'),
  requireCompletedCustomerProfile,
  estimateRequestController.getActiveEstimateRequest
);

router.post(
  '/',
  requireAuth,
  allowUserTypes('CUSTOMER'),
  requireCompletedCustomerProfile,
  estimateRequestController.createEstimateRequest
);

router.get(
  '/:estimateRequestId',
  requireAuth,
  allowUserTypes('CUSTOMER'),
  requireCompletedCustomerProfile,
  validateRequest({
    params: estimateRequestIdParamsSchema,
    errorCode: 'VALIDATION_ERROR',
  }),
  estimateRequestController.getEstimateRequestDetail
);

router.patch(
  '/:estimateRequestId/step',
  requireAuth,
  allowUserTypes('CUSTOMER'),
  requireCompletedCustomerProfile,
  validateRequest({
    params: estimateRequestIdParamsSchema,
    body: saveEstimateRequestStepBodySchema,
    errorCode: 'VALIDATION_ERROR',
  }),
  estimateRequestController.saveEstimateRequestStep
);

router.patch(
  '/:estimateRequestId/field',
  requireAuth,
  allowUserTypes('CUSTOMER'),
  requireCompletedCustomerProfile,
  validateRequest({
    params: estimateRequestIdParamsSchema,
    body: reviseEstimateRequestFieldBodySchema,
    errorCode: 'VALIDATION_ERROR',
  }),
  estimateRequestController.reviseEstimateRequestField
);

router.post(
  '/:estimateRequestId/submit',
  requireAuth,
  allowUserTypes('CUSTOMER'),
  requireCompletedCustomerProfile,
  validateRequest({
    params: estimateRequestIdParamsSchema,
    errorCode: 'VALIDATION_ERROR',
  }),
  estimateRequestController.submitEstimateRequest
);

// 견적제안/반려 등 하위 리소스 라우트는 이 아래에 추가
// 예: POST /:estimateRequestId/quotes, POST /:estimateRequestId/rejects

export default router;
