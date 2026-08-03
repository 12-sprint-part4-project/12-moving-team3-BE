import { Router } from 'express';
import * as adminMemberController from '../controllers/admin-member.controller';
import { requireAdminAuth } from '../middlewares/admin-auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import {
  adminMemberDetailParamsSchema,
  adminMemberListQuerySchema,
} from '../schemas/admin-member.schema';

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

// 관리자 회원 상세 조회
router.get(
  '/:memberId',
  requireAdminAuth,
  validateRequest({
    params: adminMemberDetailParamsSchema,
    errorCode: 'ADMIN_INVALID_QUERY_PARAM',
  }),
  adminMemberController.getAdminMemberDetail
);

export default router;
