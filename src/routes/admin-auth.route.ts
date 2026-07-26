import { Router } from 'express';
import * as adminAuthController from '../controllers/admin-auth.controller';

const router = Router();

/**
 * @swagger
 * /api/admin/auth/login:
 *   post:
 *     tags: [Admin Auth]
 *     summary: 관리자 로그인
 *     description: |
 *       관리자 이메일/비밀번호로 로그인합니다.
 *       device는 Body로 받지 않고 User-Agent를 서버에서 판별합니다.
 *       Access Token은 응답 body로, Refresh Token은 httpOnly Cookie(adminRefreshToken)로 전달합니다.
 *       Swagger UI 응답 패널에는 Set-Cookie가 잘 안 보일 수 있으므로,
 *       브라우저 Network 탭 Response Headers와 Application > Cookies(path=/api/admin/auth)에서 확인하세요.
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
 *             $ref: '#/components/schemas/AdminLoginRequest'
 *           example:
 *             email: admin@example.com
 *             password: admin1234
 *     responses:
 *       200:
 *         description: 로그인 성공
 *         headers:
 *           Set-Cookie:
 *             description: 관리자 Refresh Token (httpOnly, path=/api/admin/auth)
 *             schema:
 *               type: string
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AdminLoginResponse'
 *       400:
 *         description: 요청 body 유효성 검사 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error:
 *                 code: ADMIN_INVALID_LOGIN_BODY
 *                 message: 로그인 요청 형식이 올바르지 않습니다.
 *       401:
 *         description: 이메일 또는 비밀번호 불일치
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error:
 *                 code: ADMIN_INVALID_CREDENTIALS
 *                 message: 이메일 또는 비밀번호가 올바르지 않습니다.
 *       500:
 *         description: 서버 내부 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error:
 *                 code: INTERNAL_SERVER_ERROR
 *                 message: 서버 내부 오류가 발생했습니다.
 */
router.post('/login', adminAuthController.login);

export default router;
