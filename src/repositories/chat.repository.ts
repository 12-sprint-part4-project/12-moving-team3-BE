import type { ChatRoom, ChatRoomType } from '@prisma/client';
import { prisma } from '../lib/prisma';

export type ChatRoomRecord = ChatRoom;

interface CreateChatRoomData {
  estimateRequestId?: number;
  quoteId?: number;
  designatedMoverId?: number;
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
