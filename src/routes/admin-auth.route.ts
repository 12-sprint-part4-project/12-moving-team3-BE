import { Router } from 'express';
import * as adminAuthController from '../controllers/admin-auth.controller';
import { requireAdminAuth } from '../middlewares/admin-auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import { adminLoginBodySchema } from '../schemas/admin-auth.schema';

const router = Router();

// 관리자 로그인 (Swagger: src/docs/admin-auth.swagger.yaml)
router.post(
  '/login',
  validateRequest({
    body: adminLoginBodySchema,
    errorCode: 'ADMIN_INVALID_LOGIN_BODY',
  }),
  adminAuthController.loginAdmin
);

// Access Token 없이 Refresh Cookie만으로 재발급한다.
router.post('/refresh', adminAuthController.refreshAdminToken);

// Access Token 만료·쿠키 부재여도 클라이언트 인증 상태를 정리할 수 있게 한다.
router.post('/logout', adminAuthController.logoutAdmin);

// 관리자 내 인증 정보 조회 (Swagger: src/docs/admin-auth.swagger.yaml)
router.get('/me', requireAdminAuth, adminAuthController.getAdminMe);

export default router;
