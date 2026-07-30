import { Router } from 'express';
import * as presignedUrlController from '../controllers/presigned-url.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import { presignedUploadUrlQuerySchema } from '../schemas/presigned-url.schema';

const router = Router();

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
