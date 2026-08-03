import type { NextFunction, Request, Response } from 'express';
import type { AuthenticatedAdmin } from '../middlewares/admin-auth.middleware';
import type {
  AdminMemberDetailParams,
  AdminMemberListQuery,
  AdminMemberStatusParams,
} from '../schemas/admin-member.schema';
import * as adminMemberService from '../services/admin-member.service';
import { getValidated } from '../utils/validated.util';

/** 관리자 회원 목록 조회 */
export const getAdminMemberList = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const query = getValidated<AdminMemberListQuery>(res, 'query');

    const data = await adminMemberService.getAdminMemberList(query);

    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
};

/** 관리자 회원 상세 조회 */
export const getAdminMemberDetail = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { memberId } = getValidated<AdminMemberDetailParams>(res, 'params');

    const data = await adminMemberService.getAdminMemberDetail(memberId);

    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
};

/** 관리자 회원 정지 */
export const suspendAdminMember = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { memberId } = getValidated<AdminMemberStatusParams>(res, 'params');
    // requireAdminAuth가 검증한 관리자 신원 — 이후 History 기록 시 actor로 사용한다
    const { adminId } = res.locals.admin as AuthenticatedAdmin;

    const data = await adminMemberService.suspendAdminMember(
      memberId,
      adminId
    );

    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
};

/** 관리자 회원 활성화 */
export const activateAdminMember = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { memberId } = getValidated<AdminMemberStatusParams>(res, 'params');
    // requireAdminAuth가 검증한 관리자 신원 — 이후 History 기록 시 actor로 사용한다
    const { adminId } = res.locals.admin as AuthenticatedAdmin;

    const data = await adminMemberService.activateAdminMember(
      memberId,
      adminId
    );

    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
};
