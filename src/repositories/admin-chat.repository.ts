import { Prisma, type MessageType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import type { AdminChatListQuery } from '../schemas/admin-chat.schema';

/**
 * 목록·상세 공통 참여자 select.
 * leftAt·deletedAt 필터 없이 전 이력을 내려 Service에서 isDeleted·중복 정규화를 한다.
 */
const adminChatParticipantSelect = {
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
} satisfies Prisma.ChatRoomParticipantSelect;

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
  participants: {
    select: adminChatParticipantSelect,
  },
} satisfies Prisma.ChatRoomSelect;

export type AdminChatListRow = Prisma.ChatRoomGetPayload<{
  select: typeof adminChatListSelect;
}>;

/** 관리자 채팅방 상세 select — 목록 필드 + designatedMoverId */
const adminChatDetailSelect = {
  id: true,
  roomType: true,
  estimateRequestId: true,
  quoteId: true,
  designatedMoverId: true,
  communityPostId: true,
  lastMessageAt: true,
  createdAt: true,
  updatedAt: true,
  participants: {
    select: adminChatParticipantSelect,
  },
} satisfies Prisma.ChatRoomSelect;

export type AdminChatDetailRow = Prisma.ChatRoomGetPayload<{
  select: typeof adminChatDetailSelect;
}>;

/** 관리자 메시지 히스토리 select — Presigned URL 변환은 Service에서 fileKey로 처리 */
const adminChatMessageSelect = {
  id: true,
  roomId: true,
  senderId: true,
  messageType: true,
  content: true,
  isFiltered: true,
  createdAt: true,
  sender: {
    select: {
      id: true,
      name: true,
      nickname: true,
      email: true,
      userType: true,
      deletedAt: true,
    },
  },
  attachments: {
    orderBy: { id: 'asc' as const },
    select: {
      fileKey: true,
    },
  },
} satisfies Prisma.ChatMessageSelect;

export type AdminChatMessageRow = Prisma.ChatMessageGetPayload<{
  select: typeof adminChatMessageSelect;
}>;

interface FindAdminChatMessagesByCursorParams {
  roomId: number;
  before?: number;
  limit: number;
}

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

/**
 * 채팅방 존재 여부만 확인한다.
 * 메시지 조회 전 존재 검사용 — 상세 participants까지 가져오지 않는다.
 */
export const findAdminChatRoomId = async (
  roomId: number
): Promise<{ id: number } | null> => {
  return prisma.chatRoom.findUnique({
    where: { id: roomId },
    select: { id: true },
  });
};

/**
 * 관리자 채팅방 상세 조회.
 * 없으면 null을 반환하고, 404 판단은 Service에서 한다.
 */
export const findAdminChatRoomDetail = async (
  roomId: number
): Promise<AdminChatDetailRow | null> => {
  return prisma.chatRoom.findUnique({
    where: { id: roomId },
    select: adminChatDetailSelect,
  });
};

/**
 * 관리자 채팅 메시지 커서 조회.
 * joinedAt·참여 여부 제한 없이 방 전체 메시지를 id 내림차순으로 가져온다.
 * hasNext는 사용자 chat.repository와 같이 limit+1 조회로 Repository에서 판단한다.
 * nextCursor 계산은 Service 책임이다.
 */
export const findAdminChatMessagesByCursor = async (
  params: FindAdminChatMessagesByCursorParams
): Promise<{ messages: AdminChatMessageRow[]; hasNext: boolean }> => {
  const rows = await prisma.chatMessage.findMany({
    where: {
      roomId: params.roomId,
      ...(params.before !== undefined && {
        id: { lt: params.before },
      }),
    },
    orderBy: { id: 'desc' },
    take: params.limit + 1,
    select: adminChatMessageSelect,
  });

  const hasNext = rows.length > params.limit;
  const messages = hasNext ? rows.slice(0, params.limit) : rows;

  return { messages, hasNext };
};
