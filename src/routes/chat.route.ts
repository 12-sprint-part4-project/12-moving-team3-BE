import { Router } from 'express';
import * as chatController from '../controllers/chat.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import {
  chatRoomIdParamsSchema,
  createChatRoomBodySchema,
  getChatMessagesQuerySchema,
  markChatRoomAsReadBodySchema,
  sendChatMessageBodySchema,
} from '../schemas/chat.schema';

const router = Router();

/**
 * @swagger
 * /api/chat/rooms:
 *   get:
 *     tags: [Chat]
 *     summary: 채팅방 목록 조회
 *     description: |
 *       인증된 사용자가 활성 참여 중인 채팅방 목록을 반환합니다.
 *       최근 메시지·미읽음 수는 재참여(joinedAt) 이후 메시지만 반영합니다.
 *       Bearer Access Token 인증이 필요합니다.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 채팅방 목록 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     rooms:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           roomId:
 *                             type: integer
 *                           roomType:
 *                             type: string
 *                             enum: [GENERAL, DESIGNATED, COMMUNITY]
 *                           partner:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                                 format: uuid
 *                               userType:
 *                                 type: string
 *                                 enum: [CUSTOMER, MOVER]
 *                               nickname:
 *                                 type: string
 *                               profileImageUrl:
 *                                 type: string
 *                                 nullable: true
 *                           lastMessage:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               content:
 *                                 type: string
 *                               messageType:
 *                                 type: string
 *                                 enum: [TEXT, IMAGE]
 *                               createdAt:
 *                                 type: string
 *                                 format: date-time
 *                           unreadCount:
 *                             type: integer
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/rooms', requireAuth, chatController.getChatRoomList);

/**
 * @swagger
 * /api/chat/rooms/{roomId}/messages:
 *   get:
 *     tags: [Chat]
 *     summary: 채팅 메시지 이력 조회
 *     description: |
 *       채팅방의 메시지 이력을 커서(`before`) 기반으로 조회합니다.
 *       활성 참여자만 접근 가능하며, 재참여(joinedAt) 이후 메시지만 반환합니다.
 *       Bearer Access Token 인증이 필요합니다.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: 채팅방 ID
 *       - in: query
 *         name: before
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: 이 messageId 이전(더 오래된) 메시지를 조회
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 30
 *         description: 조회 개수 (기본 30)
 *     responses:
 *       200:
 *         description: 메시지 이력 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     messages:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           messageId:
 *                             type: integer
 *                           senderId:
 *                             type: string
 *                             format: uuid
 *                           senderUserType:
 *                             type: string
 *                             enum: [CUSTOMER, MOVER]
 *                           messageType:
 *                             type: string
 *                             enum: [TEXT, IMAGE]
 *                           content:
 *                             type: string
 *                           isFiltered:
 *                             type: boolean
 *                           attachments:
 *                             type: array
 *                             items:
 *                               type: string
 *                             description: S3 fileKey 목록
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                 meta:
 *                   type: object
 *                   properties:
 *                     hasNext:
 *                       type: boolean
 *                     nextCursor:
 *                       type: integer
 *                       nullable: true
 *                       description: 다음 페이지 조회 시 before에 전달할 messageId
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
router.get(
  '/rooms/:roomId/messages',
  requireAuth,
  validateRequest({
    params: chatRoomIdParamsSchema,
    query: getChatMessagesQuerySchema,
    errorCode: 'INVALID_REQUEST',
  }),
  chatController.getChatMessages
);

/**
 * @swagger
 * /api/chat/rooms/{roomId}/messages:
 *   post:
 *     tags: [Chat]
 *     summary: 채팅 텍스트 메시지 전송
 *     description: |
 *       채팅방에 TEXT 메시지를 전송합니다.
 *       활성 참여자만 발송 가능하며, 이사 완료 등으로 발송이 제한된 방에서는 거부됩니다.
 *       전화·계좌/카드·욕설은 서버에서 마스킹되며, 필터 시 원문은 rawLog에만 저장됩니다.
 *       상대가 나간 상태면 재참여시켜 목록에 다시 노출합니다.
 *       IMAGE 전송·Idempotency-Key·소켓 브로드캐스트는 이번 범위에 포함되지 않습니다.
 *       Bearer Access Token 인증이 필요합니다.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: 채팅방 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [messageType, content]
 *             properties:
 *               messageType:
 *                 type: string
 *                 enum: [TEXT]
 *               content:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 2000
 *           example:
 *             messageType: TEXT
 *             content: 안녕하세요, 이사 일정 문의드립니다.
 *     responses:
 *       201:
 *         description: 메시지 전송 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     messageId:
 *                       type: integer
 *                     senderId:
 *                       type: string
 *                       format: uuid
 *                     senderUserType:
 *                       type: string
 *                       enum: [CUSTOMER, MOVER]
 *                     messageType:
 *                       type: string
 *                       enum: [TEXT, IMAGE]
 *                     content:
 *                       type: string
 *                       description: 마스킹된 메시지 내용
 *                     isFiltered:
 *                       type: boolean
 *                     attachments:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: TEXT는 빈 배열
 *                     createdAt:
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
  '/rooms/:roomId/messages',
  requireAuth,
  validateRequest({
    params: chatRoomIdParamsSchema,
    body: sendChatMessageBodySchema,
    errorCode: 'INVALID_REQUEST',
  }),
  chatController.sendChatMessage
);

/**
 * @swagger
 * /api/chat/rooms/{roomId}/read:
 *   post:
 *     tags: [Chat]
 *     summary: 채팅방 읽음 처리
 *     description: |
 *       마지막으로 읽은 메시지(`lastReadMessageId`)를 기준으로 읽음 상태를 갱신합니다.
 *       활성 참여자만 처리할 수 있으며, 해당 방·재참여(joinedAt) 이후 메시지만 유효합니다.
 *       이미 더 앞선 메시지를 읽은 경우 현재 읽음 위치를 그대로 반환합니다(전진만 허용).
 *       소켓 브로드캐스트는 이번 범위에 포함되지 않습니다.
 *       Bearer Access Token 인증이 필요합니다.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: 채팅방 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [lastReadMessageId]
 *             properties:
 *               lastReadMessageId:
 *                 type: integer
 *                 minimum: 1
 *                 description: 마지막으로 읽은 메시지 ID
 *           example:
 *             lastReadMessageId: 42
 *     responses:
 *       200:
 *         description: 읽음 처리 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     lastReadMessageId:
 *                       type: integer
 *                       description: 반영된 마지막 읽음 메시지 ID
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
  '/rooms/:roomId/read',
  requireAuth,
  validateRequest({
    params: chatRoomIdParamsSchema,
    body: markChatRoomAsReadBodySchema,
    errorCode: 'INVALID_REQUEST',
  }),
  chatController.markChatRoomAsRead
);

/**
 * @swagger
 * /api/chat/rooms/{roomId}:
 *   get:
 *     tags: [Chat]
 *     summary: 채팅방 상세 조회
 *     description: |
 *       채팅방의 상대방 정보, 견적 요청 요약, 메시지 발송 가능 여부를 반환합니다.
 *       활성 참여자(leftAt IS NULL)만 조회할 수 있습니다.
 *       Bearer Access Token 인증이 필요합니다.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: 채팅방 ID
 *     responses:
 *       200:
 *         description: 채팅방 상세 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     partner:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                         userType:
 *                           type: string
 *                           enum: [CUSTOMER, MOVER]
 *                         nickname:
 *                           type: string
 *                         profileImageUrl:
 *                           type: string
 *                           nullable: true
 *                     requestSummary:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         estimateRequestId:
 *                           type: integer
 *                         moveType:
 *                           type: string
 *                           enum: [SMALL, HOME, OFFICE]
 *                           nullable: true
 *                         moveDate:
 *                           type: string
 *                           format: date
 *                           nullable: true
 *                         originAddress:
 *                           type: string
 *                           nullable: true
 *                         destinationAddress:
 *                           type: string
 *                           nullable: true
 *                     quoteId:
 *                       type: integer
 *                       nullable: true
 *                     isMessagingAllowed:
 *                       type: boolean
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
router.get(
  '/rooms/:roomId',
  requireAuth,
  validateRequest({
    params: chatRoomIdParamsSchema,
    errorCode: 'INVALID_REQUEST',
  }),
  chatController.getChatRoomDetail
);

/**
 * @swagger
 * /api/chat/rooms:
 *   post:
 *     tags: [Chat]
 *     summary: 채팅방 생성
 *     description: |
 *       지정 요청 시점(`quoteId` 없음)과 견적 발송 시점(`quoteId` 있음) 모두에서 호출 가능합니다.
 *       이미 `designatedMoverId`로 방이 있으면 새 방을 만들지 않고 기존 방에 `quoteId`만 업데이트합니다.
 *       Bearer Access Token 인증이 필요합니다.
 *     security:
 *       - bearerAuth: []
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
