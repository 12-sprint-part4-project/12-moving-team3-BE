import { Prisma, type MessageType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import type { AdminChatListQuery } from '../schemas/admin-chat.schema';

/** 관리자 채팅방 목록 select — DTO 매핑에 필요한 방·참여자 필드만 조회 */
const adminChatListSelect = {
  id: true,
  roomType: true,
  estimateRequestId: true,
  quoteId: true,
  communityPostId: true,
  lastMessageAt: true,
  createdAt: true,
  updatedAt: true,
  // leftAt·deletedAt 필터 없이 전 이력을 내려 Service에서 isDeleted·표시를 결정한다.
  participants: {
    select: {
      participantId: true,
      joinedAt: true,
      leftAt: true,
      user: {
        select: {
          id: true,
          name: true,
          nickname: true,
          email: true,
          userType: true,
          deletedAt: true,
        },
      },
    },
  },
} satisfies Prisma.ChatRoomSelect;

export type AdminChatListRow = Prisma.ChatRoomGetPayload<{
  select: typeof adminChatListSelect;
}>;

/** 방별 최근 메시지 요약 — 목록 lastMessage 매핑용 */
export interface AdminChatLastMessageRow {
  id: number;
  roomId: number;
  senderId: string;
  content: string;
  messageType: MessageType;
  createdAt: Date;
}

/**
 * 목록/카운트에 공통으로 쓰는 where.
 * search·roomType만 반영하며, 탈퇴 User·이탈 Participant는 제외하지 않는다.
 */
const buildAdminChatListWhere = (
  params: Pick<AdminChatListQuery, 'search' | 'roomType'>
): Prisma.ChatRoomWhereInput => {
  const where: Prisma.ChatRoomWhereInput = {};

  if (params.roomType) {
    where.roomType = params.roomType;
  }

  if (params.search) {
    // 참여자 User의 식별 정보 중 하나라도 맞으면 해당 방을 포함한다.
    where.participants = {
      some: {
        user: {
          OR: [
            { name: { contains: params.search, mode: 'insensitive' } },
            { nickname: { contains: params.search, mode: 'insensitive' } },
            { email: { contains: params.search, mode: 'insensitive' } },
            { phoneNumber: { contains: params.search, mode: 'insensitive' } },
          ],
        },
      },
    };
  }

  return where;
};

/** 관리자 채팅방 목록 + 전체 건수 조회 (totalPages·DTO 매핑은 Service에서 처리) */
export const findAdminChatRoomsWithCount = async (
  params: AdminChatListQuery
): Promise<{ items: AdminChatListRow[]; totalCount: number }> => {
  const where = buildAdminChatListWhere(params);
  const skip = (params.page - 1) * params.pageSize;

  const [items, totalCount] = await prisma.$transaction([
    prisma.chatRoom.findMany({
      where,
      select: adminChatListSelect,
      // 메시지 없는 방(lastMessageAt null)이 최근 활동 방보다 위로 오지 않게 nulls last.
      orderBy: [
        { lastMessageAt: { sort: 'desc', nulls: 'last' } },
        { updatedAt: 'desc' },
        { id: 'desc' },
      ],
      skip,
      take: params.pageSize,
    }),
    prisma.chatRoom.count({ where }),
  ]);

  return { items, totalCount };
};

/**
 * 방별 최근 메시지를 배치 조회한다.
 * groupBy(_max id) → findMany 2쿼리로 N+1을 피한다.
 * 관리자 목록은 joinedAt 필터 없이 방 전체 최신 메시지 1건을 반환한다.
 */
export const findAdminChatLastMessagesByRoomIds = async (
  roomIds: number[]
): Promise<Map<number, AdminChatLastMessageRow>> => {
  if (roomIds.length === 0) {
    return new Map();
  }

  const latestByRoom = await prisma.chatMessage.groupBy({
    by: ['roomId'],
    where: { roomId: { in: roomIds } },
    _max: { id: true },
  });

  const latestMessageIds = latestByRoom
    .map((row) => row._max.id)
    .filter((id): id is number => id !== null);

  if (latestMessageIds.length === 0) {
    return new Map();
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

  return new Map(messages.map((message) => [message.roomId, message]));
};
