import type {
  AdminChatDetailDto,
  AdminChatLastMessageDto,
  AdminChatListItemDto,
  AdminChatListResultDto,
  AdminChatMessageDto,
  AdminChatMessagesResultDto,
  AdminChatMessageSenderDto,
  AdminChatParticipantDto,
} from '../dtos/admin-chat.dto';
import {
  findAdminChatLastMessagesByRoomIds,
  findAdminChatMessagesByCursor,
  findAdminChatRoomDetail,
  findAdminChatRoomId,
  findAdminChatRoomsWithCount,
  type AdminChatLastMessageRow,
  type AdminChatListRow,
  type AdminChatMessageRow,
} from '../repositories/admin-chat.repository';
import type {
  AdminChatListQuery,
  AdminChatMessagesQuery,
} from '../schemas/admin-chat.schema';
import { AppError } from '../utils/app.error';
import { createPresignedViewUrl } from './s3.service';

/** 목록·상세가 공유하는 참여자 row (동일 participant select) */
type AdminChatParticipantRow = AdminChatListRow['participants'][number];

/**
 * 동일 participantId의 재참여 row 중 joinedAt이 가장 최근인 것만 남긴다.
 * DB는 변경하지 않고 목록·상세 표시용으로만 정규화한다.
 */
const pickLatestParticipantsByUser = (
  participants: AdminChatParticipantRow[]
): AdminChatParticipantRow[] => {
  const latestByParticipantId = new Map<string, AdminChatParticipantRow>();

  for (const participant of participants) {
    const existing = latestByParticipantId.get(participant.participantId);

    // joinedAt이 더 최근이거나, 동일 시각이면 나중에 순회한 row로 갱신한다.
    if (!existing || participant.joinedAt >= existing.joinedAt) {
      latestByParticipantId.set(participant.participantId, participant);
    }
  }

  return [...latestByParticipantId.values()];
};

/** Repository participant row → 참여자 DTO */
const toAdminChatParticipantDto = (
  participant: AdminChatParticipantRow
): AdminChatParticipantDto => ({
  id: participant.user.id,
  name: participant.user.name,
  nickname: participant.user.nickname,
  email: participant.user.email,
  userType: participant.user.userType,
  joinedAt: participant.joinedAt,
  leftAt: participant.leftAt,
  // deletedAt은 DTO에 노출하지 않고 탈퇴 여부만 정규화한다.
  isDeleted: participant.user.deletedAt !== null,
});

/** Repository lastMessage row → 목록 lastMessage DTO */
const toAdminChatLastMessageDto = (
  message: AdminChatLastMessageRow
): AdminChatLastMessageDto => ({
  id: message.id,
  senderId: message.senderId,
  content: message.content,
  messageType: message.messageType,
  createdAt: message.createdAt,
});

/** Repository 채팅방 row + lastMessage → 목록 아이템 DTO */
const toAdminChatListItem = (
  row: AdminChatListRow,
  lastMessage: AdminChatLastMessageRow | undefined
): AdminChatListItemDto => ({
  id: row.id,
  roomType: row.roomType,
  estimateRequestId: row.estimateRequestId,
  quoteId: row.quoteId,
  communityPostId: row.communityPostId,
  lastMessageAt: row.lastMessageAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  participants: pickLatestParticipantsByUser(row.participants).map(
    toAdminChatParticipantDto
  ),
  lastMessage: lastMessage ? toAdminChatLastMessageDto(lastMessage) : null,
});

/** 첨부 fileKey 목록을 조회용 Presigned URL로 변환한다. */
const toAttachmentViewUrls = async (
  attachments: { fileKey: string }[]
): Promise<string[]> => {
  return Promise.all(
    attachments.map((attachment) => createPresignedViewUrl(attachment.fileKey))
  );
};

/** Repository sender → 메시지 발신자 DTO */
const toAdminChatMessageSenderDto = (
  sender: AdminChatMessageRow['sender']
): AdminChatMessageSenderDto => ({
  id: sender.id,
  name: sender.name,
  nickname: sender.nickname,
  email: sender.email,
  userType: sender.userType,
  isDeleted: sender.deletedAt !== null,
});

/** Repository 메시지 row → 메시지 DTO (attachments는 Presigned URL) */
const toAdminChatMessageDto = async (
  message: AdminChatMessageRow
): Promise<AdminChatMessageDto> => ({
  id: message.id,
  senderId: message.senderId,
  sender: toAdminChatMessageSenderDto(message.sender),
  messageType: message.messageType,
  content: message.content,
  isFiltered: message.isFiltered,
  attachments: await toAttachmentViewUrls(message.attachments),
  createdAt: message.createdAt,
});

/** 관리자 채팅방 목록 조회 */
export const getAdminChatList = async (
  params: AdminChatListQuery
): Promise<AdminChatListResultDto> => {
  const { items, totalCount } = await findAdminChatRoomsWithCount(params);

  const roomIds = items.map((room) => room.id);
  // 페이지 내 방만 한 번에 조회해 방마다 findFirst 하는 N+1을 피한다.
  const lastMessageByRoomId =
    await findAdminChatLastMessagesByRoomIds(roomIds);

  return {
    items: items.map((row) =>
      toAdminChatListItem(row, lastMessageByRoomId.get(row.id))
    ),
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      totalCount,
      totalPages: Math.ceil(totalCount / params.pageSize),
    },
  };
};

/** 관리자 채팅방 상세 조회 */
export const getAdminChatDetail = async (
  roomId: number
): Promise<AdminChatDetailDto> => {
  const room = await findAdminChatRoomDetail(roomId);

  if (!room) {
    throw new AppError('ADMIN_CHAT_ROOM_NOT_FOUND');
  }

  return {
    id: room.id,
    roomType: room.roomType,
    estimateRequestId: room.estimateRequestId,
    quoteId: room.quoteId,
    designatedMoverId: room.designatedMoverId,
    communityPostId: room.communityPostId,
    lastMessageAt: room.lastMessageAt,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    participants: pickLatestParticipantsByUser(room.participants).map(
      toAdminChatParticipantDto
    ),
  };
};

/** 관리자 채팅 메시지 히스토리 조회 */
export const getAdminChatMessages = async (
  roomId: number,
  query: AdminChatMessagesQuery
): Promise<AdminChatMessagesResultDto> => {
  // 메시지 조회 전 id만 확인해 상세 participants 전체를 불필요하게 가져오지 않는다.
  const room = await findAdminChatRoomId(roomId);

  if (!room) {
    throw new AppError('ADMIN_CHAT_ROOM_NOT_FOUND');
  }

  const { messages, hasNext } = await findAdminChatMessagesByCursor({
    roomId,
    before: query.before,
    limit: query.limit,
  });

  const messageItems = await Promise.all(
    messages.map((message) => toAdminChatMessageDto(message))
  );

  // id DESC이므로 배열 마지막이 가장 오래된 메시지 → 다음 페이지 커서
  const oldestMessage = messageItems[messageItems.length - 1];

  return {
    messages: messageItems,
    meta: {
      hasNext,
      nextCursor: hasNext && oldestMessage ? oldestMessage.id : null,
    },
  };
};
