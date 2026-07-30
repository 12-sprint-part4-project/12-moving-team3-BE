import { Router } from 'express';
import * as presignedUrlController from '../controllers/presigned-url.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import { presignedUploadUrlQuerySchema } from '../schemas/presigned-url.schema';

const router = Router();

// S3 업로드용 Presigned URL 발급 (so.md 1번 API)
router.get(
  '/presigned-upload-url',
  requireAuth,
  validateRequest({
    query: presignedUploadUrlQuerySchema,
    errorCode: 'INVALID_QUERY_PARAM',
  }),
  presignedUrlController.getPresignedUploadUrl
);

export default router;
