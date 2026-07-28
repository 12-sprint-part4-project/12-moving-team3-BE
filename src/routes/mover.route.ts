import { Router } from 'express';
import * as estimateRequestController from '../controllers/estimate-request.controller';
import * as moverProfileController from '../controllers/mover-profile.controller';
import * as quoteController from '../controllers/quote.controller';
import { upload } from '../middlewares/upload.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import { moverProfileBodySchema } from '../schemas/mover-profile.schema';
import { estimateRequestListQuerySchema } from '../schemas/estimate-request.schema';
import {
  quoteBodySchema,
  quoteIdParamsSchema,
  quoteListQuerySchema,
  quoteParamsSchema,
} from '../schemas/quote.schema';
import { allowUserTypes, requireAuth } from '../middlewares/auth.middleware';

const router = Router();

/**
 * @swagger
 * /api/users/movers/profile:
 *   patch:
 *     tags: [Movers]
 *     summary: 기사님 프로필 등록/수정
 *     description: |
 *       기사님(MOVER)이 프로필 정보를 등록하거나 수정합니다.
 *       - Content-Type: `multipart/form-data`
 *       - `profileImage`는 선택값입니다.
 *       - `profileImage`를 보내지 않으면 기존 프로필 이미지를 유지합니다.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - nickname
 *               - career
 *               - shortDescription
 *               - description
 *               - service
 *               - serviceRegions
 *             properties:
 *               nickname:
 *                 type: string
 *                 description: 사이트에 노출될 기사 별명 (2~20자)
 *                 example: 김코드
 *               career:
 *                 type: integer
 *                 description: 경력(년)
 *                 minimum: 0
 *                 example: 8
 *               shortDescription:
 *                 type: string
 *                 description: 한 줄 소개 (최대 10자)
 *                 example: 꼼꼼한이사
 *               description:
 *                 type: string
 *                 description: 상세 소개 (최소 8자)
 *                 example: 포장부터 정리까지 책임지고 진행합니다.
 *               service:
 *                 type: array
 *                 description: 제공 서비스 목록 (최소 1개)
 *                 minItems: 1
 *                 items:
 *                   type: string
 *                   enum: [SMALL, HOME, OFFICE]
 *                 example: [HOME, SMALL]
 *               serviceRegions:
 *                 type: array
 *                 description: 서비스 가능 지역 목록 (최소 1개)
 *                 minItems: 1
 *                 items:
 *                   type: string
 *                   enum:
 *                     - SEOUL
 *                     - GYEONGGI
 *                     - INCHEON
 *                     - GANGWON
 *                     - CHUNGBUK
 *                     - CHUNGNAM
 *                     - SEJONG
 *                     - DAEJEON
 *                     - JEONBUK
 *                     - GWANGJU_JEONNAM
 *                     - GYEONGBUK
 *                     - DAEGU
 *                     - ULSAN
 *                     - GYEONGNAM
 *                     - BUSAN
 *                     - JEJU
 *                 example: [SEOUL, GYEONGGI]
 *               profileImage:
 *                 type: string
 *                 format: binary
 *                 description: 프로필 이미지 파일 (jpeg/png/webp, 최대 5MB)
 *           examples:
 *             default:
 *               summary: 기사님 프로필 등록/수정 예시
 *               value:
 *                 nickname: 김코드
 *                 career: 8
 *                 shortDescription: 꼼꼼한이사
 *                 description: 포장부터 정리까지 책임지고 진행합니다.
 *                 service: [HOME, SMALL]
 *                 serviceRegions: [SEOUL, GYEONGGI]
 *     responses:
 *       200:
 *         description: 프로필 등록/수정 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [data]
 *               properties:
 *                 data:
 *                   type: object
 *                   required:
 *                     - nickname
 *                     - career
 *                     - shortDescription
 *                     - description
 *                     - service
 *                     - serviceRegions
 *                     - profileImageUrl
 *                     - updatedAt
 *                   properties:
 *                     nickname:
 *                       type: string
 *                       example: 김코드
 *                     career:
 *                       type: integer
 *                       example: 8
 *                     shortDescription:
 *                       type: string
 *                       example: 꼼꼼한이사
 *                     description:
 *                       type: string
 *                       example: 포장부터 정리까지 책임지고 진행합니다.
 *                     service:
 *                       type: array
 *                       items:
 *                         type: string
 *                         enum: [SMALL, HOME, OFFICE]
 *                       example: [HOME, SMALL]
 *                     serviceRegions:
 *                       type: array
 *                       items:
 *                         type: string
 *                         enum:
 *                           - SEOUL
 *                           - GYEONGGI
 *                           - INCHEON
 *                           - GANGWON
 *                           - CHUNGBUK
 *                           - CHUNGNAM
 *                           - SEJONG
 *                           - DAEJEON
 *                           - JEONBUK
 *                           - GWANGJU_JEONNAM
 *                           - GYEONGBUK
 *                           - DAEGU
 *                           - ULSAN
 *                           - GYEONGNAM
 *                           - BUSAN
 *                           - JEJU
 *                       example: [SEOUL, GYEONGGI]
 *                     profileImageUrl:
 *                       type: string
 *                       nullable: true
 *                       description: 공개 프로필 이미지 URL. CDN/S3 공개 base URL이 없으면 null
 *                       example: null
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                       example: '2026-07-28T08:20:00.000Z'
 *       400:
 *         description: 요청 본문 형식 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: 로그인 필요
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: 기사님(MOVER)만 접근 가능
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: 등록 대상 프로필 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: 닉네임 중복
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.patch(
  '/profile',
  requireAuth,
  allowUserTypes('MOVER'),
  upload.single('profileImage'),
  validateRequest({
    body: moverProfileBodySchema,
    errorCode: 'INVALID_REQUEST_BODY',
  }),
  moverProfileController.saveMoverProfile
);

// 기사님이 받은 견적 요청 목록 조회 (Swagger 문서: src/docs/mover.swagger.yaml)
router.get(
  '/estimate-requests',
  requireAuth,
  allowUserTypes('MOVER'),
  validateRequest({
    query: estimateRequestListQuerySchema,
    errorCode: 'INVALID_QUERY_PARAM',
  }),
  estimateRequestController.getReceivedEstimateRequests
);

// 견적 보내기 / 반려하기 (Swagger 문서: src/docs/mover.swagger.yaml)
router.post(
  '/estimate-requests/:estimateRequestId/quotes',
  requireAuth,
  allowUserTypes('MOVER'),
  validateRequest({
    params: quoteParamsSchema,
    body: quoteBodySchema,
    errorCode: 'INVALID_REQUEST_BODY',
  }),
  quoteController.submitQuote
);

// 보낸 견적 / 반려한 견적 목록 조회 (Swagger 문서: src/docs/mover.swagger.yaml)
router.get(
  '/quotes',
  requireAuth,
  allowUserTypes('MOVER'),
  validateRequest({
    query: quoteListQuerySchema,
    errorCode: 'INVALID_QUERY_PARAM',
  }),
  quoteController.getQuotes
);

// 견적 상세 조회 (Swagger 문서: src/docs/mover.swagger.yaml)
router.get(
  '/quotes/:quoteId',
  requireAuth,
  allowUserTypes('MOVER'),
  validateRequest({
    params: quoteIdParamsSchema,
    errorCode: 'INVALID_REQUEST',
  }),
  quoteController.getQuoteDetail
);
export default router;
