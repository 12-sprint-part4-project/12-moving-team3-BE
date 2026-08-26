import { Prisma, type MessageType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import type { ChatTransactionClient } from './chat.repository.types';

interface RoomLastMessage {
  messageId: number;
  senderId: string;
  content: string;
  messageType: MessageType;
  createdAt: Date;
}

interface FindMessagesByRoomCursorParams {
  roomId: number;
  joinedAt: Date;
  before?: number;
  limit: number;
}

interface CreateTextMessageData {
  roomId: number;
  senderId: string;
  content: string;
  isFiltered: boolean;
  rawContent?: string;
}

interface CreateImageMessageAttachment {
  fileKey: string;
  fileSize: number;
}

interface CreateImageMessageData {
  roomId: number;
  senderId: string;
  attachments: CreateImageMessageAttachment[];
}

interface FindMessageInRoomAfterJoinedAtParams {
  roomId: number;
  messageId: number;
  joinedAt: Date;
}

/**
 * 방별 최근 메시지를 조회한다.
 * 방마다 전체 최신 메시지 1건을 가져온 뒤, joinedAt 이전 메시지는 제외한다.
 */
export const findLastMessagesByRooms = async (
  rooms: Array<{ roomId: number; joinedAt: Date }>
) => {
  if (rooms.length === 0) {
    return new Map<number, RoomLastMessage>();
  }

  const roomIds = rooms.map((room) => room.roomId);
  const joinedAtByRoomId = new Map(
    rooms.map((room) => [room.roomId, room.joinedAt])
  );

  const latestByRoom = await prisma.chatMessage.groupBy({
    by: ['roomId'],
    where: { roomId: { in: roomIds } },
    _max: { id: true },
  });

  const latestMessageIds = latestByRoom
    .map((row) => row._max.id)
    .filter((id): id is number => id !== null);

  if (latestMessageIds.length === 0) {
    return new Map<number, RoomLastMessage>();
  }

  const messages = await prisma.chatMessage.findMany({
    where: { id: { in: latestMessageIds } },
    select: {
      id: true,
      roomId: true,
      senderId: true,
      content: true,
      messageType: true,
      createdAt: true,
    },
  });

  const lastMessageByRoomId = new Map<number, RoomLastMessage>();

  for (const message of messages) {
    const joinedAt = joinedAtByRoomId.get(message.roomId);

    if (!joinedAt || message.createdAt < joinedAt) {
      continue;
    }

    lastMessageByRoomId.set(message.roomId, {
      messageId: message.id,
      senderId: message.senderId,
      content: message.content,
      messageType: message.messageType,
      createdAt: message.createdAt,
    });
  }

  return lastMessageByRoomId;
};
/**
 * 채팅방 메시지를 roomId+id 커서로 조회한다.
 * - joinedAt 이후 메시지만 포함
 * - id 내림차순, limit+1건 조회로 hasNext 판단
 */
export const findMessagesByRoomCursor = async (
  params: FindMessagesByRoomCursorParams
) => {
  const rows = await prisma.chatMessage.findMany({
    where: {
      roomId: params.roomId,
      createdAt: { gte: params.joinedAt },
      ...(params.before !== undefined && {
        id: { lt: params.before },
      }),
    },
    orderBy: { id: 'desc' },
    take: params.limit + 1,
    select: {
      id: true,
      senderId: true,
      content: true,
      messageType: true,
      isFiltered: true,
      createdAt: true,
      sender: {
        select: {
          userType: true,
        },
      },
      attachments: {
        orderBy: { id: 'asc' },
        select: {
          fileKey: true,
        },
      },
    },
  });

  const hasNext = rows.length > params.limit;
  const messages = hasNext ? rows.slice(0, params.limit) : rows;

  return { messages, hasNext };
};
/**
 * 나간 상대(활성 참여 row 없음)를 재참여시킨다.
 * 이전 leftAt row는 유지하고, leftAt IS NULL인 새 row만 생성한다.
 * joinedAt은 재참여를 유발한 메시지 createdAt과 같게 맞춰,
 * 해당 메시지가 목록 lastMessage·이력 조회에서 빠지지 않게 한다.
 * 동시 재참여 unique 충돌(P2002)은 이미 재참여된 것으로 보고 무시한다.
 */
const rejoinLeftParticipants = async (
  tx: ChatTransactionClient,
  roomId: number,
  excludeUserId: string,
  joinedAt: Date
) => {
  const participations = await tx.chatRoomParticipant.findMany({
    where: {
      roomId,
      participantId: { not: excludeUserId },
    },
    select: {
      participantId: true,
      leftAt: true,
    },
  });

  const activeParticipantIds = new Set(
    participations
      .filter((participation) => participation.leftAt === null)
      .map((participation) => participation.participantId)
  );

  const leftParticipantIds = [
    ...new Set(
      participations.map((participation) => participation.participantId)
    ),
  ].filter((participantId) => !activeParticipantIds.has(participantId));

  if (leftParticipantIds.length === 0) {
    return;
  }

  for (const participantId of leftParticipantIds) {
    const active = await tx.chatRoomParticipant.findFirst({
      where: {
        roomId,
        participantId,
        leftAt: null,
      },
      select: { id: true },
    });

    if (active) {
      continue;
    }

    try {
      await tx.chatRoomParticipant.create({
        data: {
          roomId,
          participantId,
          joinedAt,
        },
      });
    } catch (error) {
      // 동시 재참여로 활성 unique(roomId, participantId WHERE left_at IS NULL) 충돌 시
      // 이미 다른 트랜잭션이 재참여했으므로 성공으로 본다.
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }
    }
  }
};

/**
 * 메시지 생성 후 lastMessageAt을 조건부 갱신하고, 나간 상대를 재참여시킨다.
 */
const finalizeMessageCreation = async (
  tx: ChatTransactionClient,
  roomId: number,
  senderId: string,
  createdAt: Date
) => {
  await tx.chatRoom.updateMany({
    where: {
      id: roomId,
      OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: createdAt } }],
    },
    data: { lastMessageAt: createdAt },
  });

  await rejoinLeftParticipants(tx, roomId, senderId, createdAt);
};

/**
 * TEXT 메시지를 저장하고 lastMessageAt을 갱신한다.
 * 필터된 경우 rawLog를 함께 저장하며, 나간 상대는 재참여시킨다.
 */
export const createTextMessage = async (
  tx: ChatTransactionClient,
  data: CreateTextMessageData
) => {
  const message = await tx.chatMessage.create({
    data: {
      roomId: data.roomId,
      senderId: data.senderId,
      content: data.content,
      messageType: 'TEXT',
      isFiltered: data.isFiltered,
      ...(data.isFiltered &&
        data.rawContent !== undefined && {
          rawLog: {
            create: {
              rawContent: data.rawContent,
            },
          },
        }),
    },
    select: {
      id: true,
      senderId: true,
      content: true,
      messageType: true,
      isFiltered: true,
      createdAt: true,
      sender: {
        select: {
          userType: true,
        },
      },
      attachments: {
        orderBy: { id: 'asc' },
        select: {
          fileKey: true,
        },
      },
    },
  });

  await finalizeMessageCreation(
    tx,
    data.roomId,
    data.senderId,
    message.createdAt
  );

  return message;
};

/**
 * IMAGE 메시지를 저장하고 lastMessageAt을 갱신한다.
 * attachments는 S3 fileKey·fileSize로 함께 생성하며, 나간 상대는 재참여시킨다.
 */
export const createImageMessage = async (
  tx: ChatTransactionClient,
  data: CreateImageMessageData
) => {
  const message = await tx.chatMessage.create({
    data: {
      roomId: data.roomId,
      senderId: data.senderId,
      content: '',
      messageType: 'IMAGE',
      isFiltered: false,
      attachments: {
        create: data.attachments.map((attachment) => ({
          fileKey: attachment.fileKey,
          fileSize: attachment.fileSize,
        })),
      },
    },
    select: {
      id: true,
      senderId: true,
      content: true,
      messageType: true,
      isFiltered: true,
      createdAt: true,
      sender: {
        select: {
          userType: true,
        },
      },
      attachments: {
        orderBy: { id: 'asc' },
        select: {
          fileKey: true,
        },
      },
    },
  });

  await finalizeMessageCreation(
    tx,
    data.roomId,
    data.senderId,
    message.createdAt
  );

  return message;
};
/**
 * 해당 방의 메시지가 존재하는지 확인한다.
 * joinedAt 이후 메시지만 유효로 본다.
 */
export const findMessageInRoomAfterJoinedAt = async (
  params: FindMessageInRoomAfterJoinedAtParams
) => {
  return prisma.chatMessage.findFirst({
    where: {
      id: params.messageId,
      roomId: params.roomId,
      createdAt: { gte: params.joinedAt },
    },
    select: {
      id: true,
    },
  });
};

/** chat_attachments에 참조 중인 fileKey만 반환한다. */
export const findReferencedChatAttachmentKeys = async (
  fileKeys: string[]
): Promise<string[]> => {
  if (fileKeys.length === 0) {
    return [];
  }

  const rows = await prisma.chatAttachment.findMany({
    where: { fileKey: { in: fileKeys } },
    select: { fileKey: true },
  });

  return rows.map((row) => row.fileKey);
};
