import type { Request, Response } from 'express';
import { getAuthenticatedUser } from '../middlewares/auth.middleware';
import type { CreateChatRoomBody } from '../schemas/chat.schema';
import * as chatService from '../services/chat.service';
import { AppError } from '../utils/app.error';

interface ValidatedLocals {
  params?: {
    roomId: number;
  };
}

/** GET /api/chat/rooms/:roomId — 채팅방 상세 조회 요청을 처리한다. */
export const getChatRoomDetail = async (_req: Request, res: Response) => {
  const authUser = getAuthenticatedUser(res);

  const validated = res.locals.validated as ValidatedLocals | undefined;
  const roomId = validated?.params?.roomId;

  if (roomId === undefined) {
    throw new AppError('INVALID_REQUEST');
  }

  const data = await chatService.getChatRoomDetail(authUser, roomId);

  res.status(200).json({ data });
};

/** POST /api/chat/rooms — 채팅방 생성 요청을 처리한다. */
export const createChatRoom = async (req: Request, res: Response) => {
  const authUser = getAuthenticatedUser(res);
  const body = req.body as CreateChatRoomBody;
  const result = await chatService.createChatRoom(authUser, body);

  res.status(result.status).json({
    data: result.data,
  });
};
