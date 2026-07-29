import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import { reportCreateBodySchema } from '../schemas/report.schema';
import * as reportController from '../controllers/report.controller';

const router = Router();

// 신고 등록 (Swagger: src/docs/report.swagger.yaml)
router.post(
  '/',
  requireAuth,
  validateRequest({
    body: reportCreateBodySchema,
    errorCode: 'INVALID_REQUEST_BODY',
  }),
  reportController.createReport
);

export default router;
