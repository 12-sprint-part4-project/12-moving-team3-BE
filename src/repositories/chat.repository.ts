import type { ChatRoom, ChatRoomType, MessageType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export type ChatRoomRecord = ChatRoom;

interface CreateChatRoomData {
  estimateRequestId?: number;
  quoteId?: number;
  designatedMoverId?: number;
  roomType: ChatRoomType;
  participantIds: string[];
}

interface RoomLastMessage {
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

/** 삭제되지 않은 MOVER 유저(기사님)를 ID로 조회한다. */
export const findMoverById = async (moverId: string) => {
  return prisma.user.findFirst({
    where: {
      id: moverId,
      userType: 'MOVER',
      deletedAt: null,
    },
    select: {
      id: true,
      userType: true,
    },
  });
};

/** 견적 요청을 ID로 조회한다. */
export const findEstimateRequestById = async (estimateRequestId: number) => {
  return prisma.estimateRequest.findUnique({
    where: { id: estimateRequestId },
    select: {
      id: true,
      userId: true,
    },
  });
};

/** 지정 견적 요청(EstimateDesignatedMover)을 ID로 조회한다. */
export const findDesignatedMoverById = async (designatedMoverId: number) => {
  return prisma.estimateDesignatedMover.findUnique({
    where: { id: designatedMoverId },
    select: {
      id: true,
      estimateId: true,
      moverId: true,
    },
  });
};

/** 삭제되지 않은 견적을 ID로 조회한다. */
export const findQuoteById = async (quoteId: number) => {
  return prisma.quote.findFirst({
    where: {
      id: quoteId,
      deletedAt: null,
    },
    select: {
      id: true,
      estimateRequestId: true,
      moverId: true,
    },
  });
};

/** 지정 요청 ID로 기존 채팅방을 조회한다. */
export const findRoomByDesignatedMoverId = async (
  designatedMoverId: number
): Promise<ChatRoomRecord | null> => {
  return prisma.chatRoom.findFirst({
    where: { designatedMoverId },
  });
};

/** 견적 ID로 기존 채팅방을 조회한다. */
export const findRoomByQuoteId = async (
  quoteId: number
): Promise<ChatRoomRecord | null> => {
  return prisma.chatRoom.findFirst({
    where: { quoteId },
  });
};

/**
 * 견적 요청 + roomType + 활성 참여자 조합으로 기존 채팅방을 조회한다.
 * 활성 참여자(leftAt IS NULL)가 participantIds와 정확히 일치하는 방만 반환한다.
 */
export const findRoomByEstimateAndParticipants = async (params: {
  estimateRequestId: number;
  roomType: ChatRoomType;
  participantIds: string[];
}): Promise<ChatRoomRecord | null> => {
  const rooms = await prisma.chatRoom.findMany({
    where: {
      estimateRequestId: params.estimateRequestId,
      roomType: params.roomType,
      AND: params.participantIds.map((participantId) => ({
        participants: {
          some: {
            participantId,
            leftAt: null,
          },
        },
      })),
    },
    include: {
      participants: {
        where: { leftAt: null },
        select: { participantId: true },
      },
    },
  });

  return (
    rooms.find((room) => {
      const activeIds = room.participants.map(
        (participant) => participant.participantId
      );
      return (
        activeIds.length === params.participantIds.length &&
        params.participantIds.every((id) => activeIds.includes(id))
      );
    }) ?? null
  );
};

/** 기존 채팅방에 quoteId를 연결하고 updatedAt을 갱신한다. */
export const updateRoomQuoteId = async (
  roomId: number,
  quoteId: number
): Promise<ChatRoomRecord> => {
  return prisma.chatRoom.update({
    where: { id: roomId },
    data: { quoteId },
  });
};

/** 채팅방 상세 조회에 필요한 방·참여자·견적 요청 정보를 조회한다. */
export const findRoomDetailById = async (roomId: number) => {
  return prisma.chatRoom.findUnique({
    where: { id: roomId },
    select: {
      id: true,
      quoteId: true,
      updatedAt: true,
      estimateRequest: {
        select: {
          id: true,
          moveType: true,
          moveDate: true,
          departureAddress: true,
          arrivalAddress: true,
          status: true,
        },
      },
      participants: {
        where: { leftAt: null },
        select: {
          participantId: true,
          user: {
            select: {
              id: true,
              userType: true,
              nickname: true,
              profileImageKey: true,
            },
          },
        },
      },
    },
  });
};

/**
 * 유저가 활성 참여 중인 채팅방 목록을 조회한다.
 * - 방 노출: 요청자 leftAt IS NULL
 * - participants는 leftAt 무관하게 조회(상대가 나간 방도 partner 표시)
 * - lastMessageAt → updatedAt 최신순
 */
export const findActiveRoomsByUserId = async (userId: string) => {
  return prisma.chatRoom.findMany({
    where: {
      participants: {
        some: {
          participantId: userId,
          leftAt: null,
        },
      },
    },
    orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
    select: {
      id: true,
      roomType: true,
      participants: {
        orderBy: { joinedAt: 'desc' },
        select: {
          participantId: true,
          joinedAt: true,
          leftAt: true,
          user: {
            select: {
              id: true,
              userType: true,
              nickname: true,
              profileImageKey: true,
            },
          },
        },
      },
    },
  });
};

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
      roomId: true,
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
      content: message.content,
      messageType: message.messageType,
      createdAt: message.createdAt,
    });
  }

  return lastMessageByRoomId;
};

/**
 * 방별 미읽음 메시지 수를 조회한다.
 * 마지막 읽은 메시지(id) 이후 + 본인 발신 제외 + joinedAt 이후만 카운트한다.
 */
export const findUnreadCountsByRooms = async (
  userId: string,
  rooms: Array<{ roomId: number; joinedAt: Date }>
) => {
  if (rooms.length === 0) {
    return new Map<number, number>();
  }

  const roomIds = rooms.map((room) => room.roomId);

  const lastReadStatuses = await prisma.chatReadStatus.findMany({
    where: {
      readerId: userId,
      message: {
        roomId: { in: roomIds },
      },
    },
    select: {
      messageId: true,
      message: {
        select: { roomId: true },
      },
    },
    orderBy: { messageId: 'desc' },
  });

  const lastReadMessageIdByRoomId = new Map<number, number>();

  for (const status of lastReadStatuses) {
    const roomId = status.message.roomId;

    if (!lastReadMessageIdByRoomId.has(roomId)) {
      lastReadMessageIdByRoomId.set(roomId, status.messageId);
    }
  }

  const unreadCounts = await Promise.all(
    rooms.map(async ({ roomId, joinedAt }) => {
      const lastReadMessageId = lastReadMessageIdByRoomId.get(roomId);

      const count = await prisma.chatMessage.count({
        where: {
          roomId,
          senderId: { not: userId },
          createdAt: { gte: joinedAt },
          ...(lastReadMessageId !== undefined && {
            id: { gt: lastReadMessageId },
          }),
        },
      });

      return { roomId, count };
    })
  );

  return new Map(unreadCounts.map(({ roomId, count }) => [roomId, count]));
};

/** 채팅방 존재 여부를 ID로 확인한다. */
export const findRoomById = async (roomId: number) => {
  return prisma.chatRoom.findUnique({
    where: { id: roomId },
    select: { id: true },
  });
};

/** 메시지 발송 가능 여부 판단에 필요한 방·견적 요청 상태를 조회한다. */
export const findRoomForMessaging = async (roomId: number) => {
  return prisma.chatRoom.findUnique({
    where: { id: roomId },
    select: {
      id: true,
      estimateRequest: {
        select: {
          status: true,
        },
      },
    },
  });
};

/** 유저의 활성 참여(leftAt IS NULL) 정보를 조회한다. */
export const findActiveParticipation = async (
  roomId: number,
  userId: string
) => {
  return prisma.chatRoomParticipant.findFirst({
    where: {
      roomId,
      participantId: userId,
      leftAt: null,
    },
    select: {
      joinedAt: true,
    },
  });
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

/** 채팅방과 참여자(고객·기사)를 함께 생성한다. */
export const createChatRoom = async (
  data: CreateChatRoomData
): Promise<ChatRoomRecord> => {
  return prisma.chatRoom.create({
    data: {
      roomType: data.roomType,
      ...(data.estimateRequestId !== undefined && {
        estimateRequest: { connect: { id: data.estimateRequestId } },
      }),
      ...(data.quoteId !== undefined && {
        quote: { connect: { id: data.quoteId } },
      }),
      ...(data.designatedMoverId !== undefined && {
        designatedMover: { connect: { id: data.designatedMoverId } },
      }),
      participants: {
        create: data.participantIds.map((participantId) => ({
          user: { connect: { id: participantId } },
        })),
      },
    },
  });
};

/**
 * 나간 상대(활성 참여 row 없음)를 재참여시킨다.
 * 이전 leftAt row는 유지하고, leftAt IS NULL인 새 row만 생성한다.
 */
const rejoinLeftParticipants = async (
  tx: Prisma.TransactionClient,
  roomId: number,
  excludeUserId: string
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

  await tx.chatRoomParticipant.createMany({
    data: leftParticipantIds.map((participantId) => ({
      roomId,
      participantId,
    })),
  });
};

/**
 * TEXT 메시지를 저장하고 lastMessageAt을 갱신한다.
 * 필터된 경우 rawLog를 함께 저장하며, 나간 상대는 재참여시킨다.
 */
export const createTextMessage = async (data: CreateTextMessageData) => {
  return prisma.$transaction(async (tx) => {
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

    await tx.chatRoom.update({
      where: { id: data.roomId },
      data: { lastMessageAt: message.createdAt },
    });

    await rejoinLeftParticipants(tx, data.roomId, data.senderId);

    return message;
  });
};
