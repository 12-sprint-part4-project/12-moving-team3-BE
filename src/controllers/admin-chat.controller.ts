import type { NextFunction, Request, Response } from 'express';
import type {
  AdminChatListQuery,
  AdminChatMessagesQuery,
  AdminChatRoomParams,
} from '../schemas/admin-chat.schema';
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

/** 관리자 채팅방 상세 조회 */
export const getAdminChatDetail = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { roomId } = getValidated<AdminChatRoomParams>(res, 'params');

    const data = await adminChatService.getAdminChatDetail(roomId);

    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
};

/** 관리자 채팅 메시지 히스토리 조회 */
export const getAdminChatMessages = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { roomId } = getValidated<AdminChatRoomParams>(res, 'params');
    const query = getValidated<AdminChatMessagesQuery>(res, 'query');

    const data = await adminChatService.getAdminChatMessages(roomId, query);

    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
};
