import { Router } from 'express';
import * as chatController from '../controllers/chat.controller';
import { requireAuth } from '../middlewares/require-auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import { createChatRoomBodySchema } from '../schemas/chat.schema';

const router = Router();

/**
 * @swagger
 * /api/chat/rooms:
 *   post:
 *     tags: [Chat]
 *     summary: 채팅방 생성
 *     description: |
 *       지정 요청 시점(`quoteId` 없음)과 견적 발송 시점(`quoteId` 있음) 모두에서 호출 가능합니다.
 *       이미 `designatedMoverId`로 방이 있으면 새 방을 만들지 않고 기존 방에 `quoteId`만 업데이트합니다.
 *       인증 담당 연동 전 개발용으로 `x-user-id`, `x-user-type` 헤더를 사용할 수 있습니다.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-user-id
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 개발용 mock 인증 (users.id)
 *       - in: header
 *         name: x-user-type
 *         required: false
 *         schema:
 *           type: string
 *           enum: [CUSTOMER, MOVER]
 *         description: 개발용 mock 인증
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [moverId, roomType]
 *             properties:
 *               moverId:
 *                 type: string
 *                 format: uuid
 *                 description: 상대 기사님 ID (users.id)
 *               estimateRequestId:
 *                 type: integer
 *               designatedMoverId:
 *                 type: integer
 *                 description: EstimateDesignatedMover.id
 *               quoteId:
 *                 type: integer
 *               roomType:
 *                 type: string
 *                 enum: [GENERAL, DESIGNATED, COMMUNITY]
 *           example:
 *             moverId: 11111111-1111-1111-1111-111111111111
 *             estimateRequestId: 10
 *             designatedMoverId: 5
 *             roomType: DESIGNATED
 *     responses:
 *       201:
 *         description: 신규 채팅방 생성
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     roomId:
 *                       type: integer
 *                     roomType:
 *                       type: string
 *                     quoteId:
 *                       type: integer
 *                       nullable: true
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       200:
 *         description: 기존 방 반환 또는 quoteId 업데이트
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     roomId:
 *                       type: integer
 *                     roomType:
 *                       type: string
 *                     quoteId:
 *                       type: integer
 *                       nullable: true
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/rooms',
  requireAuth,
  validateRequest({
    body: createChatRoomBodySchema,
    errorCode: 'INVALID_REQUEST',
  }),
  chatController.createChatRoom
);

export default router;
