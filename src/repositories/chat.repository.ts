import type { ChatRoom, ChatRoomType, MessageType } from '@prisma/client';
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
 * lastMessageAt → updatedAt 최신순으로 정렬한다.
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
        where: { leftAt: null },
        select: {
          participantId: true,
          joinedAt: true,
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
 * 방별 최근 메시지(가입 시각 이후)를 조회한다.
 * 재참여(joinedAt) 이전 메시지는 제외한다.
 */
export const findLastMessagesByRooms = async (
  rooms: Array<{ roomId: number; joinedAt: Date }>
) => {
  if (rooms.length === 0) {
    return new Map<number, RoomLastMessage>();
  }

  const results = await Promise.all(
    rooms.map(async ({ roomId, joinedAt }) => {
      const message = await prisma.chatMessage.findFirst({
        where: {
          roomId,
          createdAt: { gte: joinedAt },
        },
        orderBy: { id: 'desc' },
        select: {
          roomId: true,
          content: true,
          messageType: true,
          createdAt: true,
        },
      });

      return message;
    })
  );

  const lastMessageByRoomId = new Map<number, RoomLastMessage>();

  for (const message of results) {
    if (!message) {
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
