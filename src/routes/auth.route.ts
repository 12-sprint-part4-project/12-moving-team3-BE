import { Router } from 'express';
import * as authController from '../controllers/auth.controller';

const router = Router();

// 회원가입
router.post('/signup', authController.signup);

// 로그인
router.post('/login', authController.login);

// 카카오 로그인 (인가 코드 교환)
router.post('/kakao', authController.kakaoLogin);

// Access Token 재발급 (Refresh Token Rotation)
router.post('/refresh', authController.refreshAuthToken);

// 로그아웃
router.post('/logout', authController.logout);

export default router;
