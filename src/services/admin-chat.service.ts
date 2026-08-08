import type {
  AdminChatLastMessageDto,
  AdminChatListItemDto,
  AdminChatListResultDto,
  AdminChatParticipantDto,
} from '../dtos/admin-chat.dto';
import {
  findAdminChatLastMessagesByRoomIds,
  findAdminChatRoomsWithCount,
  type AdminChatLastMessageRow,
  type AdminChatListRow,
} from '../repositories/admin-chat.repository';
import type { AdminChatListQuery } from '../schemas/admin-chat.schema';

type AdminChatParticipantRow = AdminChatListRow['participants'][number];

/**
 * 동일 participantId의 재참여 row 중 joinedAt이 가장 최근인 것만 남긴다.
 * DB는 변경하지 않고 목록 표시용으로만 정규화한다.
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

/** Repository participant row → 목록 참여자 DTO */
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
