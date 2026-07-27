import { Router } from 'express';
import * as authController from '../controllers/auth.controller';

const router = Router();

/**
 * @swagger
 * /api/auth/signup:
 *   post:
 *     tags: [Auth]
 *     summary: 회원가입
 *     description: |
 *       일반 유저(CUSTOMER) 또는 기사님(DRIVER) 계정을 생성합니다.
 *       DB UserType은 DRIVER를 MOVER로 저장합니다.
 *       Access Token과 Refresh Token을 응답 body로 반환합니다.
 *       device는 Body로 받지 않고 User-Agent를 서버에서 판별합니다.
 *     parameters:
 *       - name: User-Agent
 *         in: header
 *         required: false
 *         description: 기기 유형(DESKTOP/MOBILE/TABLET) 판별에 사용. 없거나 판별 불가 시 DESKTOP.
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SignupRequest'
 *           examples:
 *             customer:
 *               summary: 일반 유저 회원가입
 *               value:
 *                 userType: CUSTOMER
 *                 name: 박소정
 *                 nickname: sojeong
 *                 email: customer@example.com
 *                 phoneNumber: "01012345678"
 *                 password: Password123!
 *                 passwordConfirmation: Password123!
 *             driver:
 *               summary: 기사님 회원가입
 *               value:
 *                 userType: DRIVER
 *                 name: 박소정
 *                 nickname: sojeong
 *                 email: mover@example.com
 *                 phoneNumber: "01098765432"
 *                 password: Password123!
 *                 passwordConfirmation: Password123!
 *     responses:
 *       201:
 *         description: 회원가입 성공
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SignupResponse'
 *       400:
 *         description: 요청 유효성 검사 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: 이메일/닉네임/전화번호 중복
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: 서버 내부 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/signup', authController.signup);

export default router;
