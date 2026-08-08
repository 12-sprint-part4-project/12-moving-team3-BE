import { Router } from 'express';

import * as favoritesController from '../controllers/favorites.controller';
import { validateRequest } from '../middlewares/validate.middleware';
import { favoriteMoverIdParamSchema } from '../schemas/favorites.schema';
import { allowUserTypes, requireAuth } from '../middlewares/auth.middleware';
import { requireCompletedCustomerProfile } from '../middlewares/profile.middleware';

const router = Router();

// 기사님 찜하기 (Swagger 문서: src/docs/favorites.swagger.yaml)
router.post(
  '/:moverId',
  requireAuth,
  allowUserTypes('CUSTOMER'),
  requireCompletedCustomerProfile,
  validateRequest({
    params: favoriteMoverIdParamSchema,
    errorCode: 'INVALID_QUERY_PARAM',
  }),
  favoritesController.addFavorite
);

// 기사님 찜 취소 (Swagger 문서: src/docs/favorites.swagger.yaml)
router.delete(
  '/:moverId',
  requireAuth,
  allowUserTypes('CUSTOMER'),
  requireCompletedCustomerProfile,
  validateRequest({
    params: favoriteMoverIdParamSchema,
    errorCode: 'INVALID_QUERY_PARAM',
  }),
  favoritesController.removeFavorite
);

export default router;
