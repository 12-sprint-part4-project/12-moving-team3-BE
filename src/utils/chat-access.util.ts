import * as chatRepository from '../repositories/chat.repository';
import type { ChatDbClient } from '../repositories/chat.repository';
import { AppError } from './app.error';

/** 채팅방 존재 여부를 확인하고 없으면 ROOM_NOT_FOUND를 던진다. */
export const assertChatRoomExists = async (roomId: number) => {
  const room = await chatRepository.findRoomById(roomId);

  if (!room) {
    throw new AppError('ROOM_NOT_FOUND');
  }

  return room;
};

/** 활성 참여(leftAt IS NULL) 여부를 확인하고 없으면 FORBIDDEN을 던진다. */
export const assertActiveChatParticipation = async (
  roomId: number,
  userId: string,
  dbClient?: ChatDbClient
) => {
  const participation = await chatRepository.findActiveParticipation(
    roomId,
    userId,
    dbClient
  );

  if (!participation) {
    throw new AppError('FORBIDDEN');
  }

  return participation;
};

/** 방 존재 + 활성 참여를 함께 확인한다. 메시지 조회·읽음 처리 등에 사용한다. */
export const assertChatRoomWithActiveParticipation = async (
  roomId: number,
  userId: string
) => {
  await assertChatRoomExists(roomId);
  return assertActiveChatParticipation(roomId, userId);
};
