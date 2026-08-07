import { Router } from 'express';
import * as testController from '../controllers/test.controller';

const router = Router();

/**
 * @swagger
 * /:
 *   get:
 *     summary: 테스트 엔드포인트
 *     tags: [Test]
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/', testController.getTest);

export default router;
