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
 *       일반 유저(CUSTOMER) 또는 기사님(MOVER) 계정을 생성합니다.
 *       Access Token은 응답 body로, Refresh Token은 httpOnly Cookie(refreshToken)로 전달합니다.
 *       Swagger UI 응답 패널에는 Set-Cookie가 잘 안 보일 수 있으므로,
 *       브라우저 Network 탭 Response Headers와 Application > Cookies(path=/api/auth)에서 확인하세요.
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
 *             mover:
 *               summary: 기사님 회원가입
 *               value:
 *                 userType: MOVER
 *                 name: 박소정
 *                 nickname: sojeong
 *                 email: mover@example.com
 *                 phoneNumber: "01098765432"
 *                 password: Password123!
 *                 passwordConfirmation: Password123!
 *     responses:
 *       201:
 *         description: 회원가입 성공
 *         headers:
 *           Set-Cookie:
 *             description: Refresh Token (httpOnly, path=/api/auth)
 *             schema:
 *               type: string
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

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: 로그인
 *     description: |
 *       일반 유저(CUSTOMER) 또는 기사님(MOVER) 계정으로 로그인합니다.
 *       요청 userType과 가입된 계정 유형이 일치해야 합니다.
 *       Access Token은 응답 body로, Refresh Token은 httpOnly Cookie(refreshToken)로 전달합니다.
 *       로그인 시 기존 Refresh Token은 새 토큰으로 교체됩니다.
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
 *             $ref: '#/components/schemas/LoginRequest'
 *           examples:
 *             customer:
 *               summary: 일반 유저 로그인
 *               value:
 *                 userType: CUSTOMER
 *                 email: customer@example.com
 *                 password: Password123!
 *             mover:
 *               summary: 기사님 로그인
 *               value:
 *                 userType: MOVER
 *                 email: mover@example.com
 *                 password: Password123!
 *     responses:
 *       200:
 *         description: 로그인 성공
 *         headers:
 *           Set-Cookie:
 *             description: Refresh Token (httpOnly, path=/api/auth)
 *             schema:
 *               type: string
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       400:
 *         description: 요청 유효성 검사 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: 이메일 또는 비밀번호 불일치
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: 사용자 유형 불일치
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
router.post('/login', authController.login);

export default router;
