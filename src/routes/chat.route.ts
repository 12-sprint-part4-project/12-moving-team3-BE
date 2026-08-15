import { Router } from 'express';
import * as chatController from '../controllers/chat.controller';
import {
  requireAuth,
  requireAuthAllowSuspended,
} from '../middlewares/auth.middleware';
import { requireCompletedProfile } from '../middlewares/profile.middleware';
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
 *       목록은 lastActivityAt(방 생성·재참여·메시지 중 최신) 내림차순입니다.
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
 *                           quoteStatus:
 *                             type: string
 *                             nullable: true
 *                             enum: [PENDING, CONFIRMED, REJECTED]
 *                             description: 연결된 견적 상태. 견적 없거나 커뮤니티 방이면 null
 *                           partner:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                                 format: uuid
 *                               userType:
 *                                 type: string
 *                                 enum: [CUSTOMER, MOVER]
 *                               name:
 *                                 type: string
 *                                 description: User.name
 *                               nickname:
 *                                 type: string
 *                                 description: User.nickname
 *                               displayName:
 *                                 type: string
 *                                 description: 표시명. COMMUNITY는 nickname, GENERAL/DESIGNATED는 name. 없으면 상대방
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
 *                               messageId:
 *                                 type: integer
 *                               senderId:
 *                                 type: string
 *                                 format: uuid
 *                               createdAt:
 *                                 type: string
 *                                 format: date-time
 *                           lastActivityAt:
 *                             type: string
 *                             format: date-time
 *                             description: 사용자 관점 마지막 활동 시각(방 생성·재참여·메시지 중 최신)
 *                           partnerLastReadMessageId:
 *                             type: integer
 *                             nullable: true
 *                           partnerLastReadAt:
 *                             type: string
 *                             format: date-time
 *                             nullable: true
 *                           unreadCount:
 *                             type: integer
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/rooms', requireAuthAllowSuspended, chatController.getChatRoomList);

/**
 * @swagger
 * /api/chat/unread-count:
 *   get:
 *     tags: [Chat]
 *     summary: 전체 미읽음 수 조회
 *     description: |
 *       인증된 사용자가 활성 참여 중인 모든 채팅방의 미읽음 메시지 수를 합산해 반환합니다.
 *       방별 정책은 목록 API와 동일합니다(마지막 읽음 이후 · 본인 발신 제외 · joinedAt 이후).
 *       Bearer Access Token 인증이 필요합니다.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 전체 미읽음 수 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     unreadCount:
 *                       type: integer
 *                       minimum: 0
 *                       description: 활성 채팅방 미읽음 합산 값
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/unread-count',
  requireAuthAllowSuspended,
  chatController.getUnreadCount
);

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
 *                             description: 전화·계좌·욕설(Exact 또는 유사도) 마스킹 여부
 *                           attachments:
 *                             type: array
 *                             items:
 *                               type: string
 *                             description: 조회용 Presigned GET URL 목록 (유효 시간 1시간)
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
  requireCompletedProfile,
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
 *     summary: 채팅 메시지 전송 (TEXT/IMAGE)
 *     description: |
 *       채팅방에 TEXT 또는 IMAGE 메시지를 전송합니다.
 *       활성 참여자만 발송 가능하며, 견적 요청이 `EXPIRED`/`CANCELED`/`COMPLETED`이거나 연결된 견적이 `REJECTED`이면 `MESSAGING_NOT_ALLOWED`(403)로 거부됩니다.
 *       TEXT: 전화·계좌/카드·욕설은 서버에서 마스킹되며, 필터 시 원문은 rawLog에만 저장됩니다.
 *       IMAGE: 사전 `GET /api/presigned-upload-url?prefix=chat-attachments`로 업로드한 s3Key를 최대 5개까지 첨부합니다.
 *       상대가 나간 상태면 재참여시켜 목록에 다시 노출합니다.
 *       성공 시 Socket.IO로 `chat:message`·수신자 `chat:unread`를 emit합니다.
 *       Idempotency-Key는 이번 범위에 포함되지 않습니다.
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
 *             oneOf:
 *               - type: object
 *                 required: [messageType, content]
 *                 properties:
 *                   messageType:
 *                     type: string
 *                     enum: [TEXT]
 *                   content:
 *                     type: string
 *                     minLength: 1
 *                     maxLength: 2000
 *               - type: object
 *                 required: [messageType, attachments]
 *                 properties:
 *                   messageType:
 *                     type: string
 *                     enum: [IMAGE]
 *                   attachments:
 *                     type: array
 *                     minItems: 1
 *                     maxItems: 5
 *                     items:
 *                       type: string
 *                     description: 공통 presign 응답의 s3Key 목록 (chat-attachments/{uuid}_{filename})
 *           examples:
 *             text:
 *               value:
 *                 messageType: TEXT
 *                 content: 안녕하세요, 이사 일정 문의드립니다.
 *             image:
 *               value:
 *                 messageType: IMAGE
 *                 attachments:
 *                   - chat-attachments/11111111-1111-1111-1111-111111111111_photo.jpg
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
 *                       description: TEXT는 마스킹된 내용, IMAGE는 빈 문자열
 *                     isFiltered:
 *                       type: boolean
 *                       description: 전화·계좌·욕설(Exact 또는 유사도) 마스킹 여부
 *                     attachments:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: TEXT는 빈 배열, IMAGE는 조회용 Presigned GET URL 목록
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
 *       413:
 *         description: 이미지 용량 초과 (5MB)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error:
 *                 code: IMAGE_SIZE_EXCEEDED
 *                 message: 이미지 용량은 5MB 이하만 업로드할 수 있습니다.
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/rooms/:roomId/messages',
  requireAuth,
  requireCompletedProfile,
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
 *       성공 시 Socket.IO로 `chat:read`·본인 `chat:unread`를 emit합니다.
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
 *                     readAt:
 *                       type: string
 *                       format: date-time
 *                       description: 반영된 읽음 시각(ISO). 소켓 `chat:read` payload와 동일
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
  requireCompletedProfile,
  validateRequest({
    params: chatRoomIdParamsSchema,
    body: markChatRoomAsReadBodySchema,
    errorCode: 'INVALID_REQUEST',
  }),
  chatController.markChatRoomAsRead
);

/**
 * @swagger
 * /api/chat/rooms/{roomId}/leave:
 *   post:
 *     tags: [Chat]
 *     summary: 채팅방 나가기
 *     description: |
 *       활성 참여 중인 채팅방에서 나갑니다. 활성 참여자 row에 `leftAt`을 설정합니다.
 *       이미 나간 상태면 `409 ALREADY_LEFT`를 반환합니다.
 *       나가기 이후 해당 시점 이전 메시지는 미노출되며, 상대가 새 메시지를 보내면 목록에 재노출될 수 있습니다.
 *       성공 시 남은 활성 참여자에게 소켓 `chat:partner-left`(`roomId`, `leftAt`)를 발송합니다.
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
 *         description: 채팅방 나가기 성공
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
 *                     leftAt:
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
 *       409:
 *         description: 이미 나간 채팅방
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error:
 *                 code: ALREADY_LEFT
 *                 message: 이미 나간 채팅방입니다.
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/rooms/:roomId/leave',
  requireAuth,
  requireCompletedProfile,
  validateRequest({
    params: chatRoomIdParamsSchema,
    errorCode: 'INVALID_REQUEST',
  }),
  chatController.leaveChatRoom
);

/**
 * @swagger
 * /api/chat/rooms/{roomId}:
 *   get:
 *     tags: [Chat]
 *     summary: 채팅방 상세 조회
 *     description: |
 *       채팅방의 상대방 정보, 견적 요청 요약, 메시지 발송 가능 여부,
 *       상대방 읽음 커서(`partnerLastReadMessageId`)와
 *       상대방 마지막 읽음 시각(`partnerLastReadAt`, 읽음 기록 없으면 null),
 *       상대 나가기 여부(`isPartnerLeft` / `partnerLeftAt`)를 반환합니다.
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
 *                     roomType:
 *                       type: string
 *                       enum: [GENERAL, DESIGNATED, COMMUNITY]
 *                     partner:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                         userType:
 *                           type: string
 *                           enum: [CUSTOMER, MOVER]
 *                         name:
 *                           type: string
 *                           description: User.name
 *                         nickname:
 *                           type: string
 *                           description: User.nickname
 *                         displayName:
 *                           type: string
 *                           description: 표시명. COMMUNITY는 nickname, GENERAL/DESIGNATED는 name. 없으면 상대방
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
 *                     quoteStatus:
 *                       type: string
 *                       nullable: true
 *                       enum: [PENDING, CONFIRMED, REJECTED]
 *                       description: 연결된 견적 상태. 견적 없거나 커뮤니티 방이면 null
 *                     isMessagingAllowed:
 *                       type: boolean
 *                       description: |
 *                         메시지 발송 가능 여부. 견적 요청이 EXPIRED/CANCELED/COMPLETED이거나
 *                         연결된 견적이 REJECTED이면 false.
 *                         COMMUNITY 등 estimate 미연결 방은 true.
 *                     partnerLastReadMessageId:
 *                       type: integer
 *                       nullable: true
 *                       description: 상대방이 마지막으로 읽은 메시지 ID. 읽음 기록 없으면 null
 *                     partnerLastReadAt:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                       description: 상대방이 마지막으로 읽은 시각(ISO). 읽음 기록 없으면 null
 *                     isPartnerLeft:
 *                       type: boolean
 *                       description: |
 *                         상대가 채팅방을 나간 상태인지.
 *                         상대 활성 참여(leftAt IS NULL)가 없고 최신 참여 이력의 leftAt이 있으면 true.
 *                     partnerLeftAt:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                       description: 상대가 나간 시각(ISO). isPartnerLeft가 false이면 null
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
  requireCompletedProfile,
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
 *       견적 채팅(`GENERAL`/`DESIGNATED`): 지정 요청 시점(`quoteId` 없음)과 견적 발송 시점(`quoteId` 있음) 모두에서 호출 가능합니다.
 *       이미 방이 있으면 재사용합니다. `quoteId`는 미연결일 때만 최초 연결하며, 이미 다른 `quoteId`가 있으면 `INVALID_REQUEST`로 거부합니다.
 *       견적 요청이 `EXPIRED`/`CANCELED`/`COMPLETED`이면 **신규 방 생성만** `MESSAGING_NOT_ALLOWED`(403)로 거부합니다. 기존 방 재사용(200)은 허용합니다.
 *       커뮤니티 채팅(`COMMUNITY`): 가구나눔 게시글 기준. 견적과 무관하며 고객·기사 모두 이용 가능합니다.
 *       Bearer Access Token 인증이 필요합니다.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 required: [moverId, roomType]
 *                 properties:
 *                   moverId:
 *                     type: string
 *                     format: uuid
 *                     description: 상대 기사님 ID (users.id)
 *                   estimateRequestId:
 *                     type: integer
 *                   designatedMoverId:
 *                     type: integer
 *                     description: EstimateDesignatedMover.id
 *                   quoteId:
 *                     type: integer
 *                   roomType:
 *                     type: string
 *                     enum: [GENERAL, DESIGNATED]
 *               - type: object
 *                 required: [moverId, communityPostId, roomType]
 *                 properties:
 *                   moverId:
 *                     type: string
 *                     format: uuid
 *                     description: 상대 유저 ID (게시글 작성자 users.id). 필드명은 견적 API와 공유
 *                   communityPostId:
 *                     type: integer
 *                     description: 가구나눔 게시글 ID
 *                   roomType:
 *                     type: string
 *                     enum: [COMMUNITY]
 *           examples:
 *             designated:
 *               summary: 지정 견적 채팅방
 *               value:
 *                 moverId: 11111111-1111-1111-1111-111111111111
 *                 estimateRequestId: 10
 *                 designatedMoverId: 5
 *                 roomType: DESIGNATED
 *             community:
 *               summary: 가구나눔 커뮤니티 채팅방
 *               value:
 *                 moverId: 22222222-2222-2222-2222-222222222222
 *                 communityPostId: 123
 *                 roomType: COMMUNITY
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
 *         description: 기존 방 반환 또는 quoteId 최초 연결
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
  requireCompletedProfile,
  validateRequest({
    body: createChatRoomBodySchema,
    errorCode: 'INVALID_REQUEST',
  }),
  chatController.createChatRoom
);

export default router;
