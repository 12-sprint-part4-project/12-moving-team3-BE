import { Router } from 'express';
import * as estimateRequestController from '../controllers/estimate-request.controller';
import {
  allowUserTypes,
  requireAuth,
} from '../middlewares/auth.middleware';
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

router.get(
  '/active',
  requireAuth,
  allowUserTypes('CUSTOMER'),
  estimateRequestController.getActiveEstimateRequest
);

router.post(
  '/',
  requireAuth,
  allowUserTypes('CUSTOMER'),
  estimateRequestController.createEstimateRequest
);

router.get(
  '/:estimateRequestId',
  requireAuth,
  allowUserTypes('CUSTOMER'),
  validateRequest({
    params: estimateRequestIdParamsSchema,
    errorCode: 'INVALID_REQUEST',
  }),
  estimateRequestController.getEstimateRequestDetail
);

router.patch(
  '/:estimateRequestId/step',
  requireAuth,
  allowUserTypes('CUSTOMER'),
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
  validateRequest({
    params: estimateRequestIdParamsSchema,
    errorCode: 'INVALID_REQUEST',
  }),
  estimateRequestController.submitEstimateRequest
);

// 견적제안/반려 등 하위 리소스 라우트는 이 아래에 추가
// 예: POST /:estimateRequestId/quotes, POST /:estimateRequestId/rejects

export default router;
