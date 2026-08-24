import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import type {
  PartnerReadStatus,
  PartnerRoomFilter,
} from './chat.repository.types';

export type { PartnerReadStatus, PartnerRoomFilter } from './chat.repository.types';

interface AdvanceReadStatusParams {
  roomId: number;
  readerId: string;
  lastReadMessageId: number;
}

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
