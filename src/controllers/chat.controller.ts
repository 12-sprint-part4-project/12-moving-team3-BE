import type { Request, Response } from 'express';
import { getAuthenticatedUser } from '../middlewares/auth.middleware';
import type {
  CreateChatRoomBody,
  GetChatMessagesQuery,
} from '../schemas/chat.schema';
import * as chatService from '../services/chat.service';
import { AppError } from '../utils/app.error';

interface ValidatedLocals {
  params?: {
    roomId: number;
  };
  query?: GetChatMessagesQuery;
}

/** GET /api/chat/rooms — 채팅방 목록 조회 요청을 처리한다. */
export const getChatRoomList = async (_req: Request, res: Response) => {
  const authUser = getAuthenticatedUser(res);
  const data = await chatService.getChatRoomList(authUser);

  res.status(200).json({ data });
};

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

/** GET /api/chat/rooms/:roomId/messages — 메시지 이력 조회 요청을 처리한다. */
export const getChatMessages = async (_req: Request, res: Response) => {
  const authUser = getAuthenticatedUser(res);

  const validated = res.locals.validated as ValidatedLocals | undefined;
  const roomId = validated?.params?.roomId;
  const query = validated?.query;

  if (roomId === undefined || query === undefined) {
    throw new AppError('INVALID_REQUEST');
  }

  const result = await chatService.getChatMessages(authUser, roomId, query);

  res.status(200).json({
    data: result.data,
    meta: result.meta,
  });
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
