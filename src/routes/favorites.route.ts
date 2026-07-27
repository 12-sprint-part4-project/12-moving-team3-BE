import { Router } from 'express';

import * as favoritesController from '../controllers/favorites.controller';
import { validateRequest } from '../middlewares/validate.middleware';
import { favoriteMoverIdParamSchema } from '../schemas/favorites.schema';

const router = Router();

/**
 * @swagger
 * /api/favorites/{moverId}:
 *   post:
 *     tags: [Favorites]
 *     summary: 기사님 찜하기
 *     description: |
 *       일반 유저(고객)가 기사님을 찜합니다.
 *       moverId는 기사님의 User id(UUID)입니다.
 *       인증은 상위/공용 auth 미들웨어가 담당한다.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: moverId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 찜할 기사님의 User id
 *     responses:
 *       201:
 *         description: 찜 등록 성공
 *       401:
 *         description: 인증되지 않은 사용자
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error:
 *                 code: UNAUTHORIZED
 *                 message: 로그인이 필요한 기능입니다.
 *       403:
 *         description: 기사님 타입 유저
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error:
 *                 code: FORBIDDEN
 *                 message: 기사님은 찜 기능을 사용할 수 없습니다.
 *       404:
 *         description: 기사님 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error:
 *                 code: MOVER_NOT_FOUND
 *                 message: 존재하지 않는 기사님입니다.
 *       409:
 *         description: 이미 찜한 기사님
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error:
 *                 code: ALREADY_FAVORITED
 *                 message: 이미 찜한 기사님입니다.
 */
// TODO: 인증 담당자가 authenticate 미들웨어를 연결하면 req.user가 주입된다
router.post(
  '/:moverId',
  validateRequest({
    params: favoriteMoverIdParamSchema,
    errorCode: 'INVALID_QUERY_PARAM',
  }),
  favoritesController.addFavorite
);

/**
 * @swagger
 * /api/favorites/{moverId}:
 *   delete:
 *     tags: [Favorites]
 *     summary: 기사님 찜 취소
 *     description: |
 *       찜한 기사님을 찜 목록에서 제거합니다.
 *       moverId는 기사님의 User id(UUID)입니다.
 *       인증은 상위/공용 auth 미들웨어가 담당한다.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: moverId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 찜 취소할 기사님의 User id
 *     responses:
 *       200:
 *         description: 찜 취소 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: 찜이 취소되었습니다.
 *       401:
 *         description: 인증되지 않은 사용자
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error:
 *                 code: UNAUTHORIZED
 *                 message: 로그인이 필요한 기능입니다.
 *       404:
 *         description: 찜 내역 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error:
 *                 code: FAVORITE_NOT_FOUND
 *                 message: 찜하지 않은 기사님입니다.
 */
router.delete(
  '/:moverId',
  validateRequest({
    params: favoriteMoverIdParamSchema,
    errorCode: 'INVALID_QUERY_PARAM',
  }),
  favoritesController.removeFavorite
);

export default router;
