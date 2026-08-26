import {
  type ChatRoomType,
  type EstimateRequestStatus,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import type {
  ChatDbClient,
  ChatRoomRecord,
  ChatTransactionClient,
  FindRoomByEstimateAndParticipantsParams,
  PromoteRoomToDesignatedParams,
} from './chat.repository.types';

interface CreateChatRoomData {
  estimateRequestId?: number;
  quoteId?: number;
  designatedMoverId?: number;
  communityPostId?: number;
  roomType: ChatRoomType;
  participantIds: string[];
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
