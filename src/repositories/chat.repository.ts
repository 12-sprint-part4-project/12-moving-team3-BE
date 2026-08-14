import {
  Prisma,
  type ChatRoom,
  type ChatRoomType,
  type EstimateRequestStatus,
  type MessageType,
} from '@prisma/client';
import { prisma } from '../lib/prisma';

export type ChatRoomRecord = ChatRoom;
export type ChatDbClient = typeof prisma | Prisma.TransactionClient;
export type ChatTransactionClient = Prisma.TransactionClient;

interface CreateChatRoomData {
  estimateRequestId?: number;
  quoteId?: number;
  designatedMoverId?: number;
  communityPostId?: number;
  roomType: ChatRoomType;
  participantIds: string[];
}

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

interface AdvanceReadStatusParams {
  roomId: number;
  readerId: string;
  lastReadMessageId: number;
}

export interface PartnerReadStatus {
  lastReadMessageId: number;
  readAt: Date;
}

export interface PartnerRoomFilter {
  roomId: number;
  partnerId: string;
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

/** 삭제되지 않은 유저를 ID로 조회한다. (userType 무관 — COMMUNITY용) */
export const findActiveUserById = async (userId: string) => {
  return prisma.user.findFirst({
    where: {
      id: userId,
      deletedAt: null,
    },
    select: {
      id: true,
    },
  });
};

/**
 * 가구나눔 게시글을 ID로 조회한다.
 * 삭제되지 않았고 category가 FURNITURE_SHARE인 글만 반환한다.
 */
export const findFurnitureSharePostById = async (postId: number) => {
  return prisma.post.findFirst({
    where: {
      id: postId,
      deletedAt: null,
      category: 'FURNITURE_SHARE',
    },
    select: {
      id: true,
      userId: true,
      isCompleted: true,
    },
  });
};

/** 견적 요청을 ID로 조회한다. */
export const findEstimateRequestById = async (
  estimateRequestId: number,
  dbClient: ChatDbClient = prisma
) => {
  return dbClient.estimateRequest.findUnique({
    where: { id: estimateRequestId },
    select: {
      id: true,
      userId: true,
      status: true,
    },
  });
};

/**
 * 견적 요청 행을 FOR UPDATE로 잠근 뒤 조회한다.
 * 채팅방 신규 생성 직전 상태 재확인용 (트랜잭션 필수).
 */
export const findEstimateRequestByIdForUpdate = async (
  estimateRequestId: number,
  tx: ChatTransactionClient
) => {
  const rows = await tx.$queryRaw<
    Array<{
      id: number;
      userId: string;
      status: EstimateRequestStatus;
    }>
  >`
    SELECT
      id,
      user_id AS "userId",
      status
    FROM estimate_requests
    WHERE id = ${estimateRequestId}
    FOR UPDATE
  `;

  return rows[0] ?? null;
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
  designatedMoverId: number,
  dbClient: ChatDbClient = prisma
): Promise<ChatRoomRecord | null> => {
  return dbClient.chatRoom.findFirst({
    where: { designatedMoverId },
  });
};

/** 견적 ID로 기존 채팅방을 조회한다. */
export const findRoomByQuoteId = async (
  quoteId: number,
  dbClient: ChatDbClient = prisma
): Promise<ChatRoomRecord | null> => {
  return dbClient.chatRoom.findFirst({
    where: { quoteId },
  });
};

/**
 * 활성 참여자(leftAt IS NULL)가 participantIds와 정확히 일치하는 방을 고른다.
 */
const pickRoomWithExactActiveParticipants = <
  T extends { participants: { participantId: string }[] },
>(
  rooms: T[],
  participantIds: string[]
): T | null => {
  return (
    rooms.find((room) => {
      const activeIds = room.participants.map(
        (participant) => participant.participantId
      );
      return (
        activeIds.length === participantIds.length &&
        participantIds.every((id) => activeIds.includes(id))
      );
    }) ?? null
  );
};

/**
 * 견적 요청 + roomType(들) + 활성 참여자 조합으로 기존 채팅방을 조회한다.
 * 활성 참여자(leftAt IS NULL)가 participantIds와 정확히 일치하는 방만 반환한다.
 * GENERAL·DESIGNATED를 함께 검색하면 DESIGNATED를 우선한다.
 */
export interface FindRoomByEstimateAndParticipantsParams {
  estimateRequestId: number;
  roomType?: ChatRoomType;
  roomTypes?: ChatRoomType[];
  participantIds: string[];
}

export const findRoomByEstimateAndParticipants = async (
  params: FindRoomByEstimateAndParticipantsParams,
  dbClient: ChatDbClient = prisma
): Promise<ChatRoomRecord | null> => {
  const roomTypes =
    params.roomTypes ??
    (params.roomType !== undefined ? [params.roomType] : undefined);

  const rooms = await dbClient.chatRoom.findMany({
    where: {
      estimateRequestId: params.estimateRequestId,
      ...(roomTypes !== undefined ? { roomType: { in: roomTypes } } : {}),
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

  const exactParticipants = rooms.filter((room) => {
    const activeIds = room.participants.map((p) => p.participantId);
    return (
      activeIds.length === params.participantIds.length &&
      params.participantIds.every((id) => activeIds.includes(id))
    );
  });

  if (exactParticipants.length === 0) {
    return null;
  }

  const searchesBothEstimateRoomTypes =
    roomTypes !== undefined &&
    roomTypes.includes('DESIGNATED') &&
    roomTypes.includes('GENERAL');

  // GENERAL|DESIGNATED 동시 검색 시 요청 roomType과 무관하게 DESIGNATED 우선
  if (searchesBothEstimateRoomTypes) {
    return (
      exactParticipants.find((room) => room.roomType === 'DESIGNATED') ??
      exactParticipants.find((room) => room.roomType === 'GENERAL') ??
      exactParticipants[0]
    );
  }

  // 단일 roomType 검색일 때만 요청 타입을 우선
  if (params.roomType !== undefined) {
    return (
      exactParticipants.find((room) => room.roomType === params.roomType) ??
      exactParticipants[0]
    );
  }

  return (
    exactParticipants.find((room) => room.roomType === 'DESIGNATED') ??
    exactParticipants.find((room) => room.roomType === 'GENERAL') ??
    exactParticipants[0]
  );
};

interface FindRoomByCommunityPostAndParticipantsParams {
  communityPostId: number;
  participantIds: string[];
}

/**
 * 가구나눔 게시글 + COMMUNITY + 활성 참여자 조합으로 기존 채팅방을 조회한다.
 * 동일 게시글이라도 참여자 쌍이 다르면 별도 방이다.
 */
export const findRoomByCommunityPostAndParticipants = async (
  params: FindRoomByCommunityPostAndParticipantsParams,
  dbClient: ChatDbClient = prisma
): Promise<ChatRoomRecord | null> => {
  const rooms = await dbClient.chatRoom.findMany({
    where: {
      communityPostId: params.communityPostId,
      roomType: 'COMMUNITY',
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

  return pickRoomWithExactActiveParticipants(rooms, params.participantIds);
};

/**
 * 기존 채팅방에 quoteId를 최초 연결한다.
 * 호출 전에 quoteId가 null인지 확인할 것 (이미 연결된 값 교체 금지).
 */
export const updateRoomQuoteId = async (
  roomId: number,
  quoteId: number,
  dbClient: ChatDbClient = prisma
): Promise<ChatRoomRecord> => {
  return dbClient.chatRoom.update({
    where: { id: roomId },
    data: { quoteId },
  });
};

/**
 * GENERAL 방만 DESIGNATED로 승격하고 designatedMoverId·(선택) quoteId를 연결한다.
 * 이미 DESIGNATED인 방에는 사용하지 않는다.
 * quoteId는 미연결(null)일 때만 함께 넘긴다 — 기존 quoteId 교체 금지.
 */
export interface PromoteRoomToDesignatedParams {
  roomId: number;
  designatedMoverId: number;
  quoteId?: number;
}

export const promoteRoomToDesignated = async (
  params: PromoteRoomToDesignatedParams,
  dbClient: ChatDbClient = prisma
): Promise<ChatRoomRecord> => {
  return dbClient.chatRoom.update({
    where: { id: params.roomId },
    data: {
      roomType: 'DESIGNATED',
      designatedMoverId: params.designatedMoverId,
      ...(params.quoteId !== undefined ? { quoteId: params.quoteId } : {}),
    },
  });
};

/** 채팅방 상세 조회에 필요한 방·참여자·견적 요청 정보를 조회한다. */
export const findRoomDetailById = async (roomId: number) => {
  return prisma.chatRoom.findUnique({
    where: { id: roomId },
    select: {
      id: true,
      roomType: true,
      quoteId: true,
      updatedAt: true,
      quote: {
        where: { deletedAt: null },
        select: {
          status: true,
        },
      },
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
        orderBy: { joinedAt: 'desc' },
        select: {
          participantId: true,
          leftAt: true,
          user: {
            select: {
              id: true,
              userType: true,
              name: true,
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
 * 방·리더 기준 읽음 상태를 조회한다.
 * 행이 없으면 null.
 */
export const findPartnerReadStatus = async (
  roomId: number,
  readerId: string
): Promise<PartnerReadStatus | null> => {
  const status = await prisma.chatReadStatus.findUnique({
    where: {
      roomId_readerId: {
        roomId,
        readerId,
      },
    },
    select: { lastReadMessageId: true, readAt: true },
  });

  return status;
};

/**
 * 방·상대(partner) 기준 읽음 상태를 일괄 조회한다.
 */
export const findPartnerReadStatusesByRooms = async (
  rooms: PartnerRoomFilter[]
): Promise<Map<number, PartnerReadStatus>> => {
  if (rooms.length === 0) {
    return new Map<number, PartnerReadStatus>();
  }

  const statuses = await prisma.chatReadStatus.findMany({
    where: {
      OR: rooms.map(({ roomId, partnerId }) => ({
        roomId,
        readerId: partnerId,
      })),
    },
    select: {
      roomId: true,
      lastReadMessageId: true,
      readAt: true,
    },
  });

  return new Map(
    statuses.map((status) => [
      status.roomId,
      {
        lastReadMessageId: status.lastReadMessageId,
        readAt: status.readAt,
      },
    ])
  );
};

/**
 * 유저가 활성 참여 중인 방의 roomId·joinedAt만 조회한다.
 * 미읽음 합산 등 partner/방 메타가 필요 없는 집계에 사용한다.
 */
export const findActiveRoomFiltersByUserId = async (userId: string) => {
  return prisma.chatRoomParticipant.findMany({
    where: {
      participantId: userId,
      leftAt: null,
    },
    select: {
      roomId: true,
      joinedAt: true,
    },
  });
};

/**
 * 유저가 활성 참여 중인 채팅방 목록을 조회한다.
 * - 방 노출: 요청자 leftAt IS NULL
 * - participants는 leftAt 무관하게 조회(상대가 나간 방도 partner 표시)
 * - DB orderBy는 보조용. 최종 순서는 Service에서 lastActivityAt으로 정렬 (#328)
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
    orderBy: [
      { lastMessageAt: { sort: 'desc', nulls: 'last' } },
      { updatedAt: 'desc' },
      { id: 'desc' },
    ],
    select: {
      id: true,
      createdAt: true,
      roomType: true,
      quote: {
        where: { deletedAt: null },
        select: {
          status: true,
        },
      },
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
              name: true,
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
 * 방별 미읽음 메시지 수를 조회한다.
 * 마지막 읽은 메시지(id) 이후 + 본인 발신 제외 + joinedAt 이후만 카운트한다.
 * 방마다 count를 나누지 않고, 방별 조건을 OR로 묶은 뒤 groupBy 한 번으로 집계한다.
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
      roomId: { in: roomIds },
    },
    select: {
      roomId: true,
      lastReadMessageId: true,
    },
  });

  const lastReadMessageIdByRoomId = new Map(
    lastReadStatuses.map((status) => [status.roomId, status.lastReadMessageId])
  );

  const roomConditions = rooms.map(({ roomId, joinedAt }) => {
    const lastReadMessageId = lastReadMessageIdByRoomId.get(roomId);

    return {
      roomId,
      createdAt: { gte: joinedAt },
      ...(lastReadMessageId !== undefined && {
        id: { gt: lastReadMessageId },
      }),
    };
  });

  const grouped = await prisma.chatMessage.groupBy({
    by: ['roomId'],
    where: {
      senderId: { not: userId },
      OR: roomConditions,
    },
    _count: { _all: true },
  });

  return new Map(grouped.map((row) => [row.roomId, row._count._all]));
};

/** 채팅방 존재 여부를 ID로 확인한다. */
export const findRoomById = async (roomId: number) => {
  return prisma.chatRoom.findUnique({
    where: { id: roomId },
    select: { id: true },
  });
};

/** 메시지 발송 가능 여부 판단에 필요한 방·견적 요청 상태를 조회한다. */
export const findRoomForMessaging = async (
  roomId: number,
  dbClient: ChatDbClient = prisma
) => {
  return dbClient.chatRoom.findUnique({
    where: { id: roomId },
    select: {
      id: true,
      estimateRequest: {
        select: {
          status: true,
        },
      },
      quote: {
        where: { deletedAt: null },
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
  userId: string,
  dbClient: ChatDbClient = prisma
) => {
  return dbClient.chatRoomParticipant.findFirst({
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

/** 채팅방의 활성 참여자 userId 목록을 반환한다. */
export const findActiveParticipantIds = async (
  roomId: number,
  dbClient: ChatDbClient = prisma
): Promise<string[]> => {
  const rows = await dbClient.chatRoomParticipant.findMany({
    where: {
      roomId,
      leftAt: null,
    },
    select: {
      participantId: true,
    },
  });

  return rows.map((row) => row.participantId);
};

/** 유저가 해당 방에 참여한 이력이 있는지(leftAt 무관) 확인한다. */
export const findAnyParticipation = async (
  roomId: number,
  userId: string,
  dbClient: ChatDbClient = prisma
) => {
  return dbClient.chatRoomParticipant.findFirst({
    where: {
      roomId,
      participantId: userId,
    },
    select: {
      id: true,
    },
  });
};

/**
 * 활성 참여 row에 leftAt을 설정한다.
 * leftAt IS NULL인 row만 갱신하며, 영향 건수는 service에서 확인한다.
 */
export const leaveActiveParticipation = async (
  roomId: number,
  userId: string,
  leftAt: Date,
  dbClient: ChatDbClient = prisma
) => {
  return dbClient.chatRoomParticipant.updateMany({
    where: {
      roomId,
      participantId: userId,
      leftAt: null,
    },
    data: { leftAt },
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

/**
 * 채팅방과 참여자를 함께 생성한다. (견적·커뮤니티 공통)
 * nested participants create는 adapter-pg 트랜잭션에서 room_id FK가 깨질 수 있어
 * 방 생성 후 참여자 createMany로 분리한다. (#265)
 */
export const createChatRoom = async (
  data: CreateChatRoomData,
  dbClient: ChatDbClient = prisma
): Promise<ChatRoomRecord> => {
  const room = await dbClient.chatRoom.create({
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
      ...(data.communityPostId !== undefined && {
        communityPost: { connect: { id: data.communityPostId } },
      }),
    },
  });

  if (data.participantIds.length > 0) {
    await dbClient.chatRoomParticipant.createMany({
      data: data.participantIds.map((participantId) => ({
        roomId: room.id,
        participantId,
      })),
    });
  }

  return room;
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

/**
 * 방-참여자 단위로 마지막 읽음 위치를 전진시킨다.
 * DB WHERE(lastReadMessageId < 요청값)로 전진만 허용해 동시 갱신 시 후퇴를 막는다.
 */
export const advanceReadStatus = async (params: AdvanceReadStatusParams) => {
  const { roomId, readerId, lastReadMessageId } = params;

  const fetchCurrent = async () => {
    return prisma.chatReadStatus.findUnique({
      where: {
        roomId_readerId: {
          roomId,
          readerId,
        },
      },
      select: { lastReadMessageId: true, readAt: true },
    });
  };

  const advanced = await prisma.chatReadStatus.updateMany({
    where: {
      roomId,
      readerId,
      lastReadMessageId: { lt: lastReadMessageId },
    },
    data: { lastReadMessageId },
  });

  if (advanced.count > 0) {
    const current = await fetchCurrent();
    if (current) {
      return current;
    }
  }

  // 행이 이미 존재하지만 전진 조건을 만족하지 못한 경우, 예외 없이 현재 값을 바로 반환한다.
  const existing = await fetchCurrent();

  if (existing) {
    return existing;
  }

  try {
    return await prisma.chatReadStatus.create({
      data: {
        roomId,
        readerId,
        lastReadMessageId,
      },
      select: { lastReadMessageId: true, readAt: true },
    });
  } catch (error) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      throw error;
    }

    // 동시 생성 충돌 시 전진만 허용하는 updateMany로 재시도한다.
    await prisma.chatReadStatus.updateMany({
      where: {
        roomId,
        readerId,
        lastReadMessageId: { lt: lastReadMessageId },
      },
      data: { lastReadMessageId },
    });

    const current = await fetchCurrent();

    return {
      lastReadMessageId: current?.lastReadMessageId ?? lastReadMessageId,
      readAt: current?.readAt ?? new Date(),
    };
  }
};
