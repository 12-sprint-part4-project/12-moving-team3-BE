import { Router } from 'express';
import * as authController from '../controllers/auth.controller';

const router = Router();

// 회원가입
router.post('/signup', authController.signup);

// 로그인
router.post('/login', authController.login);

// 로그아웃
router.post('/logout', authController.logout);

export default router;
