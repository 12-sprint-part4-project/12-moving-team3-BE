import { Router } from 'express';
import * as adminMemberController from '../controllers/admin-member.controller';
import { requireAdminAuth } from '../middlewares/admin-auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import { adminMemberListQuerySchema } from '../schemas/admin-member.schema';

const router = Router();

// 관리자 회원 목록 조회 (Swagger: src/docs/admin-member.swagger.yaml)
router.get(
  '/',
  requireAdminAuth,
  validateRequest({
    query: adminMemberListQuerySchema,
    errorCode: 'ADMIN_INVALID_QUERY_PARAM',
  }),
  adminMemberController.getAdminMemberList
);

export default router;
