import type { NextFunction, Request, Response } from 'express';
import type { AdminMemberListQuery } from '../schemas/admin-member.schema';
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
