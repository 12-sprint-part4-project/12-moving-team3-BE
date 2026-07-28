import { Router } from 'express';
import * as customerProfileController from '../controllers/customer-profile.controller';
import { allowUserTypes, requireAuth } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import { customerProfileBodySchema } from '../schemas/customer-profile.schema';

const router = Router();

router.patch(
  '/profile',
  requireAuth,
  allowUserTypes('CUSTOMER'),
  validateRequest({
    body: customerProfileBodySchema,
    errorCode: 'INVALID_REQUEST_BODY',
  }),
  customerProfileController.registerCustomerProfile
);

export default router;
