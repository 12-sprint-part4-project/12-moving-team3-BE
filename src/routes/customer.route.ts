import { Router } from 'express';
import * as customerProfileController from '../controllers/customer-profile.controller';
import { allowUserTypes, requireAuth } from '../middlewares/auth.middleware';
import { upload } from '../middlewares/upload.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import { customerProfileBodySchema } from '../schemas/customer-profile.schema';

const router = Router();

/**
 * @swagger
 * /api/users/customers/profile:
 *   patch:
 *     tags: [Customers]
 *     summary: 일반 유저 프로필 등록/수정
 *     description: |
 *       일반 유저(CUSTOMER)가 최초 프로필 정보를 등록합니다.
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
 *               - region
 *               - service
 *             properties:
 *               region:
 *                 type: string
 *                 description: 거주 지역
 *                 enum:
 *                   - SEOUL
 *                   - GYEONGGI
 *                   - INCHEON
 *                   - GANGWON
 *                   - CHUNGBUK
 *                   - CHUNGNAM
 *                   - SEJONG
 *                   - DAEJEON
 *                   - JEONBUK
 *                   - GWANGJU_JEONNAM
 *                   - GYEONGBUK
 *                   - DAEGU
 *                   - ULSAN
 *                   - GYEONGNAM
 *                   - BUSAN
 *                   - JEJU
 *                 example: SEOUL
 *               service:
 *                 type: array
 *                 description: 이용 서비스 목록 (최소 1개)
 *                 minItems: 1
 *                 items:
 *                   type: string
 *                   enum: [SMALL, HOME, OFFICE]
 *                 example: [HOME, SMALL]
 *               profileImage:
 *                 type: string
 *                 format: binary
 *                 description: 프로필 이미지 파일 (jpeg/png/webp, 최대 5MB)
 *           examples:
 *             default:
 *               summary: 일반 유저 프로필 등록 예시
 *               value:
 *                 region: SEOUL
 *                 service: [HOME, SMALL]
 *     responses:
 *       200:
 *         description: 프로필 등록 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [data]
 *               properties:
 *                 data:
 *                   type: object
 *                   required: [region, service, profileImageUrl, updatedAt]
 *                   properties:
 *                     region:
 *                       type: string
 *                       enum:
 *                         - SEOUL
 *                         - GYEONGGI
 *                         - INCHEON
 *                         - GANGWON
 *                         - CHUNGBUK
 *                         - CHUNGNAM
 *                         - SEJONG
 *                         - DAEJEON
 *                         - JEONBUK
 *                         - GWANGJU_JEONNAM
 *                         - GYEONGBUK
 *                         - DAEGU
 *                         - ULSAN
 *                         - GYEONGNAM
 *                         - BUSAN
 *                         - JEJU
 *                       example: SEOUL
 *                     service:
 *                       type: array
 *                       items:
 *                         type: string
 *                         enum: [SMALL, HOME, OFFICE]
 *                       example: [HOME, SMALL]
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
 *         description: 일반 유저(CUSTOMER)만 접근 가능
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
 *         description: 이미 프로필 등록 완료
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.patch(
  '/profile',
  requireAuth,
  allowUserTypes('CUSTOMER'),
  upload.single('profileImage'),
  validateRequest({
    body: customerProfileBodySchema,
    errorCode: 'INVALID_REQUEST_BODY',
  }),
  customerProfileController.registerCustomerProfile
);

export default router;
