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
 *     summary: 일반 유저 프로필 등록
 *     description: |
 *       일반 유저(CUSTOMER)가 최초 프로필 정보를 등록합니다.
 *       요청은 multipart/form-data 형식이며, profileImage 파일은 선택값입니다.
 *       이미 프로필 등록을 완료한 경우 409 에러를 반환합니다.
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
 *                 minItems: 1
 *                 items:
 *                   type: string
 *                   enum: [SMALL, HOME, OFFICE]
 *                 example: [HOME, SMALL]
 *               profileImage:
 *                 type: string
 *                 format: binary
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
 *         description: 일반 유저만 접근 가능
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
