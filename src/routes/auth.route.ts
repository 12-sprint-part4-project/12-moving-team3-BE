import { Router } from 'express';
import * as authController from '../controllers/auth.controller';

const router = Router();

// 회원가입 (Swagger: src/docs/auth.swagger.yaml)
router.post('/signup', authController.signup);

// 로그인 (Swagger: src/docs/auth.swagger.yaml)
router.post('/login', authController.login);

export default router;
