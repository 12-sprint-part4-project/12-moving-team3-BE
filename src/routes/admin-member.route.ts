import { Router } from 'express';
import * as adminMemberController from '../controllers/admin-member.controller';
import { requireAdmin } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import {
  adminMemberDetailParamsSchema,
  adminMemberDetailQuerySchema,
  adminMemberListQuerySchema,
  adminMemberStatusParamsSchema,
} from '../schemas/admin-member.schema';

const router = Router();

// 관리자 회원 목록 조회 (Swagger: src/docs/admin-member.swagger.yaml)
router.get(
  '/',
  requireAdmin,
  validateRequest({
    query: adminMemberListQuerySchema,
    errorCode: 'ADMIN_INVALID_QUERY_PARAM',
  }),
  adminMemberController.getAdminMemberList
);

// 관리자 회원 정지 — `/:memberId`보다 먼저 등록해 경로가 상세 조회로 잡히지 않게 한다
router.patch(
  '/:memberId/suspend',
  requireAdmin,
  validateRequest({
    params: adminMemberStatusParamsSchema,
    errorCode: 'ADMIN_INVALID_QUERY_PARAM',
  }),
  adminMemberController.suspendAdminMember
);

// 관리자 회원 활성화 — `/:memberId`보다 먼저 등록해 경로가 상세 조회로 잡히지 않게 한다
router.patch(
  '/:memberId/activate',
  requireAdmin,
  validateRequest({
    params: adminMemberStatusParamsSchema,
    errorCode: 'ADMIN_INVALID_QUERY_PARAM',
  }),
  adminMemberController.activateAdminMember
);

// 관리자 회원 상세 조회
router.get(
  '/:memberId',
  requireAdmin,
  validateRequest({
    params: adminMemberDetailParamsSchema,
    query: adminMemberDetailQuerySchema,
    errorCode: 'ADMIN_INVALID_QUERY_PARAM',
  }),
  adminMemberController.getAdminMemberDetail
);

export default router;
