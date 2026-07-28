import { Router } from 'express';

import * as favoritesController from '../controllers/favorites.controller';
import { validateRequest } from '../middlewares/validate.middleware';
import { favoriteMoverIdParamSchema } from '../schemas/favorites.schema';

const router = Router();

// 기사님 찜하기 (Swagger 문서: src/docs/favorites.swagger.yaml)
// TODO: 인증 담당자 requireAuth 미들웨어 연결
router.post(
  '/:moverId',
  validateRequest({
    params: favoriteMoverIdParamSchema,
    errorCode: 'INVALID_QUERY_PARAM',
  }),
  favoritesController.addFavorite
);

// 기사님 찜 취소 (Swagger 문서: src/docs/favorites.swagger.yaml)
router.delete(
  '/:moverId',
  validateRequest({
    params: favoriteMoverIdParamSchema,
    errorCode: 'INVALID_QUERY_PARAM',
  }),
  favoritesController.removeFavorite
);

export default router;
