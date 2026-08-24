import type { NextFunction, Request, Response } from 'express';
import { getAuthenticatedUser } from '../middlewares/auth.middleware';
import type {
  ChatRoomIdParams,
  CreateChatRoomBody,
  GetChatMessagesQuery,
  MarkChatRoomAsReadBody,
  SendChatMessageBody,
} from '../schemas/chat.schema';
import * as chatService from '../services/chat.service';
import { getValidated } from '../utils/validated.util';

/** GET /api/chat/rooms — 채팅방 목록 조회 요청을 처리한다. */
export const getChatRoomList = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authUser = getAuthenticatedUser(res);
    const data = await chatService.getChatRoomList(authUser);

    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
};

/** GET /api/chat/unread-count — 전체 미읽음 수 조회 요청을 처리한다. */
export const getUnreadCount = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authUser = getAuthenticatedUser(res);
    const data = await chatService.getUnreadCount(authUser);

    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
};

/** GET /api/chat/rooms/:roomId — 채팅방 상세 조회 요청을 처리한다. */
export const getChatRoomDetail = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authUser = getAuthenticatedUser(res);
    const { roomId } = getValidated<ChatRoomIdParams>(res, 'params');
    const data = await chatService.getChatRoomDetail(authUser, roomId);

    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
};

/** GET /api/chat/rooms/:roomId/messages — 메시지 이력 조회 요청을 처리한다. */
export const getChatMessages = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authUser = getAuthenticatedUser(res);
    const { roomId } = getValidated<ChatRoomIdParams>(res, 'params');
    const query = getValidated<GetChatMessagesQuery>(res, 'query');
    const result = await chatService.getChatMessages(authUser, roomId, query);

    res.status(200).json({
      data: result.data,
      meta: result.meta,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/chat/rooms/:roomId/messages — TEXT/IMAGE 메시지 전송 요청을 처리한다.
 */
export const sendChatMessage = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authUser = getAuthenticatedUser(res);
    const { roomId } = getValidated<ChatRoomIdParams>(res, 'params');
    const body = getValidated<SendChatMessageBody>(res, 'body');
    const data = await chatService.sendChatMessage(authUser, roomId, body);

    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/chat/rooms/:roomId/read — 채팅방 읽음 처리 요청을 처리한다.
 */
export const markChatRoomAsRead = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authUser = getAuthenticatedUser(res);
    const { roomId } = getValidated<ChatRoomIdParams>(res, 'params');
    const body = getValidated<MarkChatRoomAsReadBody>(res, 'body');
    const data = await chatService.markChatRoomAsRead(authUser, roomId, body);

    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/chat/rooms/:roomId/leave — 채팅방 나가기 요청을 처리한다.
 */
export const leaveChatRoom = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authUser = getAuthenticatedUser(res);
    const { roomId } = getValidated<ChatRoomIdParams>(res, 'params');
    const data = await chatService.leaveChatRoom(authUser, roomId);

    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
};

/** POST /api/chat/rooms — 채팅방 생성 요청을 처리한다. */
export const createChatRoom = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authUser = getAuthenticatedUser(res);
    const body = getValidated<CreateChatRoomBody>(res, 'body');
    const result = await chatService.createChatRoom(authUser, body);

    res.status(result.status).json({
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
};
