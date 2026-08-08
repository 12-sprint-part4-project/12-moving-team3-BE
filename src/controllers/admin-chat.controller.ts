import type { NextFunction, Request, Response } from 'express';
import type { AdminChatListQuery } from '../schemas/admin-chat.schema';
import * as adminChatService from '../services/admin-chat.service';
import { getValidated } from '../utils/validated.util';

/** 관리자 채팅방 목록 조회 */
export const getAdminChatList = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const query = getValidated<AdminChatListQuery>(res, 'query');

    const data = await adminChatService.getAdminChatList(query);

    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
};
