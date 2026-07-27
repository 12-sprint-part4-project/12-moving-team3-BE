import type { Request, Response } from 'express';
import type { CreateChatRoomBody } from '../schemas/chat.schema';
import * as chatService from '../services/chat.service';
import { AppError } from '../utils/app.error';

/** POST /api/chat/rooms — 채팅방 생성 요청을 처리한다. */
export const createChatRoom = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('UNAUTHORIZED');
  }

  const body = req.body as CreateChatRoomBody;
  const result = await chatService.createChatRoom(req.user, body);

  res.status(result.status).json({
    data: result.data,
  });
};
