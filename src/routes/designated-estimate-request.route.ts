import { Router } from 'express';
import * as designatedEstimateRequestController from '../controllers/designated-estimate-request.controller';
import { allowUserTypes, requireAuth } from '../middlewares/auth.middleware';
import { requireCompletedCustomerProfile } from '../middlewares/profile.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import {
  createDesignatedEstimateBodySchema,
  designatedEstimateExistenceParamsSchema,
} from '../schemas/designated-estimate-request.schema';

const router = Router();

// 지정 견적 요청 생성 (Swagger: src/docs/designated-estimate-request.swagger.yaml)
router.post(
  '/',
  requireAuth,
  allowUserTypes('CUSTOMER'),
  requireCompletedCustomerProfile,
  validateRequest({
    body: createDesignatedEstimateBodySchema,
    errorCode: 'INVALID_REQUEST_BODY',
  }),
  designatedEstimateRequestController.createDesignatedEstimateRequest
);

// 지정 견적 존재 여부 조회 (Swagger: src/docs/designated-estimate-request.swagger.yaml)
router.get(
  '/:estimateRequestId/movers/:moverId',
  requireAuth,
  allowUserTypes('CUSTOMER'),
  requireCompletedCustomerProfile,
  validateRequest({
    params: designatedEstimateExistenceParamsSchema,
    errorCode: 'VALIDATION_ERROR',
  }),
  designatedEstimateRequestController.checkDesignatedEstimateExistence
);

export default router;
