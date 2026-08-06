import type {
  ChatRoomType,
  MessageType,
  MoveType,
  UserType,
} from '@prisma/client';
import {
  CHAT_ATTACHMENT_ALLOWED_CONTENT_TYPES,
  CHAT_ATTACHMENT_MAX_SIZE,
  isValidChatAttachmentKey,
} from '../constants/chat-attachment.constants';
import { isMessagingAllowedByEstimateStatus } from '../constants/chat.constants';
import { prisma } from '../lib/prisma';
import type { AuthenticatedUser } from '../middlewares/auth.middleware';
import * as chatRepository from '../repositories/chat.repository';
import type {
  CreateChatRoomBody,
  GetChatMessagesQuery,
  MarkChatRoomAsReadBody,
  SendChatMessageBody,
} from '../schemas/chat.schema';
import { AppError } from '../utils/app.error';
import { filterChatContent } from '../utils/chat-content-filter.util';
import {
  emitChatMessageCreated,
  emitChatRoomRead,
} from './chat-socket.service';
import {
  createPresignedViewUrl,
  getObjectMetadata,
  toPresignedViewUrl,
} from './s3.service';

interface CreateChatRoomResult {
  status: 200 | 201;
  data: {
    roomId: number;
    roomType: ChatRoomType;
    quoteId: number | null;
    createdAt?: string;
    updatedAt: string;
  };
}

interface ChatRoomPartner {
  id: string;
  userType: UserType;
  nickname: string;
  profileImageUrl: string | null;
}

interface ChatRoomLastMessage {
  messageId: number;
  senderId: string;
  content: string;
  messageType: MessageType;
  createdAt: string;
}

interface ChatRoomListItem {
  roomId: number;
  roomType: ChatRoomType;
  partner: ChatRoomPartner;
  lastMessage: ChatRoomLastMessage | null;
  partnerLastReadMessageId: number | null;
  partnerLastReadAt: string | null;
  unreadCount: number;
}

interface ChatRoomListResult {
  rooms: ChatRoomListItem[];
}

interface UnreadCountResult {
  unreadCount: number;
}

interface ChatRoomDetailResult {
  partner: ChatRoomPartner;
  requestSummary: {
    estimateRequestId: number;
    moveType: MoveType | null;
    moveDate: string | null;
    originAddress: string | null;
    destinationAddress: string | null;
  } | null;
  quoteId: number | null;
  isMessagingAllowed: boolean;
  /** 상대방이 마지막으로 읽은 메시지 ID. 읽음 기록 없으면 null */
  partnerLastReadMessageId: number | null;
  /** 상대방 readAt(ISO). 읽음 기록 없으면 null */
  partnerLastReadAt: string | null;
  updatedAt: string;
}

interface ChatMessageItem {
  messageId: number;
  senderId: string;
  senderUserType: UserType;
  messageType: MessageType;
  content: string;
  isFiltered: boolean;
  attachments: string[];
  createdAt: string;
}

interface ChatMessagesData {
  messages: ChatMessageItem[];
}

interface ChatMessagesMeta {
  hasNext: boolean;
  nextCursor: number | null;
}

interface ChatMessagesResult {
  data: ChatMessagesData;
  meta: ChatMessagesMeta;
}

interface MarkChatRoomAsReadResult {
  lastReadMessageId: number;
  readAt: string;
}

interface LeaveChatRoomResult {
  roomId: number;
  leftAt: string;
}

/** Date를 ISO 8601 문자열로 변환한다. */
const toIsoString = (date: Date) => date.toISOString();

/** 비본인 참여자 중 활성(leftAt IS NULL) 참여자를 우선 선택한다. */
const selectPartnerParticipant = <
  T extends { participantId: string; leftAt: Date | null },
>(
  participants: T[],
  authUserId: string
): T | null => {
  const partnerCandidates = participants.filter(
    (participant) => participant.participantId !== authUserId
  );

  return (
    partnerCandidates.find((participant) => participant.leftAt === null) ??
    partnerCandidates[0] ??
    null
  );
};

/** Date를 YYYY-MM-DD 형식으로 변환한다. */
const toDateString = (date: Date) => date.toISOString().slice(0, 10);

/** 첨부 fileKey 목록을 조회용 Presigned URL로 변환한다. */
const toAttachmentViewUrls = async (
  attachments: { fileKey: string }[]
): Promise<string[]> => {
  return Promise.all(
    attachments.map((attachment) => createPresignedViewUrl(attachment.fileKey))
  );
};

/**
 * 채팅방 참여자 ID 목록을 결정한다.
 * - CUSTOMER: [고객, 기사]
 * - MOVER: 본인이 moverId와 일치해야 하며, 견적 요청의 고객을 포함한다.
 */
const resolveParticipantIds = async (params: {
  authUser: AuthenticatedUser;
  moverId: string;
  estimateRequestId?: number;
}): Promise<string[]> => {
  if (params.authUser.userType === 'CUSTOMER') {
    if (params.authUser.userId === params.moverId) {
      throw new AppError('INVALID_REQUEST');
    }

    return [params.authUser.userId, params.moverId];
  }

  if (params.authUser.userId !== params.moverId) {
    throw new AppError('FORBIDDEN');
  }

  if (params.estimateRequestId === undefined) {
    throw new AppError('INVALID_REQUEST');
  }

  const estimateRequest = await chatRepository.findEstimateRequestById(
    params.estimateRequestId
  );

  if (!estimateRequest) {
    throw new AppError('ESTIMATE_REQUEST_NOT_FOUND');
  }

  return [estimateRequest.userId, params.moverId];
};

/**
 * 기존 채팅방 조회 우선순위:
 * 1) designatedMoverId 2) quoteId 3) estimateRequestId + 참여자
 */
const findExistingRoom = async (params: {
  designatedMoverId?: number;
  quoteId?: number;
  estimateRequestId?: number;
  roomType: ChatRoomType;
  participantIds: string[];
}) => {
  if (params.designatedMoverId !== undefined) {
    return chatRepository.findRoomByDesignatedMoverId(params.designatedMoverId);
  }

  if (params.quoteId !== undefined) {
    return chatRepository.findRoomByQuoteId(params.quoteId);
  }

  if (params.estimateRequestId !== undefined) {
    return chatRepository.findRoomByEstimateAndParticipants({
      estimateRequestId: params.estimateRequestId,
      roomType: params.roomType,
      participantIds: params.participantIds,
    });
  }

  return null;
};

/**
 * 채팅방을 생성하거나 기존 방을 반환한다.
 * - 지정 요청으로 방이 이미 있으면 quoteId만 업데이트(200)
 * - 동일 조건의 기존 방이 있으면 그대로 반환(200)
 * - 없으면 신규 생성(201)
 * - COMMUNITY는 현재 미지원
 */
export const createChatRoom = async (
  authUser: AuthenticatedUser,
  body: CreateChatRoomBody
): Promise<CreateChatRoomResult> => {
  if (body.roomType === 'COMMUNITY') {
    throw new AppError('INVALID_REQUEST');
  }

  const mover = await chatRepository.findMoverById(body.moverId);

  if (!mover) {
    throw new AppError('MOVER_NOT_FOUND');
  }

  let estimateRequestId = body.estimateRequestId;
  let designatedMoverId = body.designatedMoverId;
  const quoteId = body.quoteId;

  if (designatedMoverId !== undefined) {
    const designatedMover =
      await chatRepository.findDesignatedMoverById(designatedMoverId);

    if (!designatedMover) {
      throw new AppError('DESIGNATED_MOVER_NOT_FOUND');
    }

    if (designatedMover.moverId !== body.moverId) {
      throw new AppError('INVALID_REQUEST');
    }

    if (
      estimateRequestId !== undefined &&
      designatedMover.estimateId !== estimateRequestId
    ) {
      throw new AppError('INVALID_REQUEST');
    }

    estimateRequestId = estimateRequestId ?? designatedMover.estimateId;
  }

  if (quoteId !== undefined) {
    const quote = await chatRepository.findQuoteById(quoteId);

    if (!quote) {
      throw new AppError('QUOTE_NOT_FOUND');
    }

    if (quote.moverId !== body.moverId) {
      throw new AppError('INVALID_REQUEST');
    }

    if (
      estimateRequestId !== undefined &&
      quote.estimateRequestId !== estimateRequestId
    ) {
      throw new AppError('INVALID_REQUEST');
    }

    estimateRequestId = estimateRequestId ?? quote.estimateRequestId;
  }

  if (estimateRequestId !== undefined) {
    const estimateRequest =
      await chatRepository.findEstimateRequestById(estimateRequestId);

    if (!estimateRequest) {
      throw new AppError('ESTIMATE_REQUEST_NOT_FOUND');
    }

    if (
      authUser.userType === 'CUSTOMER' &&
      estimateRequest.userId !== authUser.userId
    ) {
      throw new AppError('FORBIDDEN');
    }
  }

  if (body.roomType === 'DESIGNATED' && designatedMoverId === undefined) {
    throw new AppError('INVALID_REQUEST');
  }

  if (body.roomType === 'GENERAL' && estimateRequestId === undefined) {
    throw new AppError('INVALID_REQUEST');
  }

  const participantIds = await resolveParticipantIds({
    authUser,
    moverId: body.moverId,
    estimateRequestId,
  });

  const existingRoom = await findExistingRoom({
    designatedMoverId,
    quoteId,
    estimateRequestId,
    roomType: body.roomType,
    participantIds,
  });

  if (existingRoom) {
    const shouldUpdateQuoteId =
      quoteId !== undefined && existingRoom.quoteId !== quoteId;

    if (shouldUpdateQuoteId && quoteId !== undefined) {
      const updatedRoom = await chatRepository.updateRoomQuoteId(
        existingRoom.id,
        quoteId
      );

      return {
        status: 200,
        data: {
          roomId: updatedRoom.id,
          roomType: updatedRoom.roomType,
          quoteId: updatedRoom.quoteId,
          updatedAt: toIsoString(updatedRoom.updatedAt),
        },
      };
    }

    return {
      status: 200,
      data: {
        roomId: existingRoom.id,
        roomType: existingRoom.roomType,
        quoteId: existingRoom.quoteId,
        createdAt: toIsoString(existingRoom.createdAt),
        updatedAt: toIsoString(existingRoom.updatedAt),
      },
    };
  }

  const createdRoom = await chatRepository.createChatRoom({
    estimateRequestId,
    quoteId,
    designatedMoverId,
    roomType: body.roomType,
    participantIds,
  });

  return {
    status: 201,
    data: {
      roomId: createdRoom.id,
      roomType: createdRoom.roomType,
      quoteId: createdRoom.quoteId,
      createdAt: toIsoString(createdRoom.createdAt),
      updatedAt: toIsoString(createdRoom.updatedAt),
    },
  };
};

/**
 * 채팅방 목록을 조회한다.
 * - 활성 참여(leftAt IS NULL) 방만 포함
 * - 상대가 나간 방도 목록에 유지(partner는 최신 참여 이력 기준)
 * - lastMessage / unreadCount는 최근 joinedAt 이후 메시지만 반영
 */
export const getChatRoomList = async (
  authUser: AuthenticatedUser
): Promise<ChatRoomListResult> => {
  const rooms = await chatRepository.findActiveRoomsByUserId(authUser.userId);

  const roomVisibility = rooms
    .map((room) => {
      const myParticipation = room.participants.find(
        (participant) =>
          participant.participantId === authUser.userId &&
          participant.leftAt === null
      );

      if (!myParticipation) {
        return null;
      }

      return {
        room,
        joinedAt: myParticipation.joinedAt,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const roomFilters = roomVisibility.map(({ room, joinedAt }) => ({
    roomId: room.id,
    joinedAt,
  }));

  const partnerRoomFilters = roomVisibility.flatMap(({ room }) => {
    const partnerParticipant = selectPartnerParticipant(
      room.participants,
      authUser.userId
    );

    if (!partnerParticipant) {
      return [];
    }

    return [
      {
        roomId: room.id,
        partnerId: partnerParticipant.participantId,
      },
    ];
  });

  const [lastMessageByRoomId, unreadCountByRoomId, partnerReadStatusByRoomId] =
    await Promise.all([
      chatRepository.findLastMessagesByRooms(roomFilters),
      chatRepository.findUnreadCountsByRooms(authUser.userId, roomFilters),
      chatRepository.findPartnerReadStatusesByRooms(partnerRoomFilters),
    ]);

  const roomListItems = (
    await Promise.all(
      roomVisibility.map(async ({ room }): Promise<ChatRoomListItem | null> => {
        const partnerParticipant = selectPartnerParticipant(
          room.participants,
          authUser.userId
        );

        if (!partnerParticipant) {
          return null;
        }

        const partner = partnerParticipant.user;
        const lastMessage = lastMessageByRoomId.get(room.id);
        const partnerReadStatus = partnerReadStatusByRoomId.get(room.id);

        return {
          roomId: room.id,
          roomType: room.roomType,
          partner: {
            id: partner.id,
            userType: partner.userType,
            nickname: partner.nickname,
            profileImageUrl: await toPresignedViewUrl(partner.profileImageKey),
          },
          lastMessage: lastMessage
            ? {
                messageId: lastMessage.messageId,
                senderId: lastMessage.senderId,
                content: lastMessage.content,
                messageType: lastMessage.messageType,
                createdAt: toIsoString(lastMessage.createdAt),
              }
            : null,
          partnerLastReadMessageId:
            partnerReadStatus?.lastReadMessageId ?? null,
          partnerLastReadAt: partnerReadStatus
            ? toIsoString(partnerReadStatus.readAt)
            : null,
          unreadCount: unreadCountByRoomId.get(room.id) ?? 0,
        };
      })
    )
  ).filter((item): item is ChatRoomListItem => item !== null);

  return { rooms: roomListItems };
};

/**
 * 활성 참여 중인 모든 채팅방의 미읽음 수를 합산한다.
 * 방별 정책은 목록 API와 동일(마지막 읽음 이후 · 본인 발신 제외 · joinedAt 이후).
 */
export const getUnreadCount = async (
  authUser: AuthenticatedUser
): Promise<UnreadCountResult> => {
  const roomFilters = await chatRepository.findActiveRoomFiltersByUserId(
    authUser.userId
  );
  const unreadCountByRoomId = await chatRepository.findUnreadCountsByRooms(
    authUser.userId,
    roomFilters
  );

  let unreadCount = 0;
  for (const count of unreadCountByRoomId.values()) {
    unreadCount += count;
  }

  return { unreadCount };
};

/**
 * 채팅방 상세 정보를 조회한다.
 * - 활성 참여자(leftAt IS NULL)만 접근 가능
 * - partner는 상대방 유저 정보(활성 우선, 없으면 최근 참여 이력)를 반환
 * - partnerLastReadMessageId는 상대방 읽음 커서(없으면 null)
 */
export const getChatRoomDetail = async (
  authUser: AuthenticatedUser,
  roomId: number
): Promise<ChatRoomDetailResult> => {
  const room = await chatRepository.findRoomDetailById(roomId);

  if (!room) {
    throw new AppError('ROOM_NOT_FOUND');
  }

  const isActiveParticipant = room.participants.some(
    (participant) =>
      participant.participantId === authUser.userId && participant.leftAt === null
  );

  if (!isActiveParticipant) {
    throw new AppError('FORBIDDEN');
  }

  const partnerParticipant = selectPartnerParticipant(
    room.participants,
    authUser.userId
  );

  if (!partnerParticipant) {
    throw new AppError('ROOM_NOT_FOUND');
  }

  const partner = partnerParticipant.user;
  const partnerReadStatus = await chatRepository.findPartnerReadStatus(
    roomId,
    partner.id
  );

  return {
    partner: {
      id: partner.id,
      userType: partner.userType,
      nickname: partner.nickname,
      profileImageUrl: await toPresignedViewUrl(partner.profileImageKey),
    },
    requestSummary: room.estimateRequest
      ? {
          estimateRequestId: room.estimateRequest.id,
          moveType: room.estimateRequest.moveType,
          moveDate: room.estimateRequest.moveDate
            ? toDateString(room.estimateRequest.moveDate)
            : null,
          originAddress: room.estimateRequest.departureAddress,
          destinationAddress: room.estimateRequest.arrivalAddress,
        }
      : null,
    quoteId: room.quoteId,
    isMessagingAllowed: isMessagingAllowedByEstimateStatus(
      room.estimateRequest?.status
    ),
    partnerLastReadMessageId: partnerReadStatus?.lastReadMessageId ?? null,
    partnerLastReadAt: partnerReadStatus
      ? toIsoString(partnerReadStatus.readAt)
      : null,
    updatedAt: toIsoString(room.updatedAt),
  };
};

/**
 * 채팅방 메시지 이력을 커서 기반으로 조회한다.
 * - 활성 참여자만 접근 가능
 * - 가장 최근 joinedAt 이후 메시지만 반환
 * - before(messageId) 이전 메시지를 id 내림차순으로 조회
 */
export const getChatMessages = async (
  authUser: AuthenticatedUser,
  roomId: number,
  query: GetChatMessagesQuery
): Promise<ChatMessagesResult> => {
  const room = await chatRepository.findRoomById(roomId);

  if (!room) {
    throw new AppError('ROOM_NOT_FOUND');
  }

  const participation = await chatRepository.findActiveParticipation(
    roomId,
    authUser.userId
  );

  if (!participation) {
    throw new AppError('FORBIDDEN');
  }

  const { messages, hasNext } = await chatRepository.findMessagesByRoomCursor({
    roomId,
    joinedAt: participation.joinedAt,
    before: query.before,
    limit: query.limit,
  });

  const messageItems: ChatMessageItem[] = await Promise.all(
    messages.map(async (message) => ({
      messageId: message.id,
      senderId: message.senderId,
      senderUserType: message.sender.userType,
      messageType: message.messageType,
      content: message.content,
      isFiltered: message.isFiltered,
      attachments: await toAttachmentViewUrls(message.attachments),
      createdAt: toIsoString(message.createdAt),
    }))
  );

  const oldestMessage = messageItems[messageItems.length - 1];

  return {
    data: {
      messages: messageItems,
    },
    meta: {
      hasNext,
      nextCursor: hasNext && oldestMessage ? oldestMessage.messageId : null,
    },
  };
};

/**
 * TEXT/IMAGE 메시지를 전송한다.
 * - 활성 참여자만 발송 가능
 * - isMessagingAllowed가 false이면 거부
 * - TEXT: 클린봇 마스킹 후 저장, 필터 시 rawLog 보관
 * - IMAGE: S3에 업로드된 fileKey(최대 5개)를 검증·저장
 * - 나간 상대는 재참여시켜 목록에 재노출
 */
export const sendChatMessage = async (
  authUser: AuthenticatedUser,
  roomId: number,
  body: SendChatMessageBody
): Promise<ChatMessageItem> => {
  if (body.messageType === 'IMAGE') {
    return sendImageMessage(authUser, roomId, body.attachments);
  }

  return sendTextMessage(authUser, roomId, body.content);
};

/** TEXT 메시지 저장·마스킹·재참여 처리를 수행한다. */
const sendTextMessage = async (
  authUser: AuthenticatedUser,
  roomId: number,
  content: string
): Promise<ChatMessageItem> => {
  const { maskedContent, isFiltered, rawContent } = filterChatContent(content);

  const message = await prisma.$transaction(async (tx) => {
    await assertCanSendMessage(tx, roomId, authUser.userId);

    return chatRepository.createTextMessage(tx, {
      roomId,
      senderId: authUser.userId,
      content: maskedContent,
      isFiltered,
      ...(isFiltered && { rawContent }),
    });
  });

  const item = await toChatMessageItem(message);
  await emitChatMessageCreated({
    roomId,
    senderId: authUser.userId,
    message: item,
  });

  return item;
};

/**
 * IMAGE 메시지 첨부를 검증한 뒤 저장한다.
 * 권한 확인 후 fileKey 형식·S3 존재·MIME·용량을 검증하고 ChatAttachment에 fileSize를 기록한다.
 */
const sendImageMessage = async (
  authUser: AuthenticatedUser,
  roomId: number,
  attachments: string[]
): Promise<ChatMessageItem> => {
  // S3 메타데이터 조회로 객체 존재/크기/MIME을 유추할 수 있으므로 권한을 먼저 확인한다.
  await assertCanSendMessage(prisma, roomId, authUser.userId);

  if (new Set(attachments).size !== attachments.length) {
    throw new AppError('INVALID_REQUEST', '첨부 이미지 key가 중복되었습니다.');
  }

  for (const fileKey of attachments) {
    if (!isValidChatAttachmentKey(fileKey)) {
      throw new AppError(
        'INVALID_REQUEST',
        '유효하지 않은 첨부 이미지 key입니다.'
      );
    }
  }

  const resolvedAttachments = await Promise.all(
    attachments.map(async (fileKey) => {
      const metadata = await getObjectMetadata(fileKey);

      if (!metadata) {
        throw new AppError(
          'INVALID_REQUEST',
          '업로드되지 않은 첨부 이미지입니다.'
        );
      }

      if (metadata.contentLength > CHAT_ATTACHMENT_MAX_SIZE) {
        throw new AppError('IMAGE_SIZE_EXCEEDED');
      }

      if (
        !metadata.contentType ||
        !(CHAT_ATTACHMENT_ALLOWED_CONTENT_TYPES as readonly string[]).includes(
          metadata.contentType
        )
      ) {
        throw new AppError('INVALID_IMAGE_FORMAT');
      }

      return {
        fileKey,
        fileSize: metadata.contentLength,
      };
    })
  );

  const message = await prisma.$transaction(async (tx) => {
    // 트랜잭션 직전 권한 상태 변경(나가기 등)에 대비해 재확인한다.
    await assertCanSendMessage(tx, roomId, authUser.userId);

    return chatRepository.createImageMessage(tx, {
      roomId,
      senderId: authUser.userId,
      attachments: resolvedAttachments,
    });
  });

  const item = await toChatMessageItem(message);
  await emitChatMessageCreated({
    roomId,
    senderId: authUser.userId,
    message: item,
  });

  return item;
};

/** 방 존재·활성 참여·발송 가능 여부를 확인하고 실패 시 AppError를 던진다. */
const assertCanSendMessage = async (
  dbClient: chatRepository.ChatDbClient,
  roomId: number,
  userId: string
) => {
  const room = await chatRepository.findRoomForMessaging(roomId, dbClient);

  if (!room) {
    throw new AppError('ROOM_NOT_FOUND');
  }

  const participation = await chatRepository.findActiveParticipation(
    roomId,
    userId,
    dbClient
  );

  if (!participation) {
    throw new AppError('FORBIDDEN');
  }

  if (!isMessagingAllowedByEstimateStatus(room.estimateRequest?.status)) {
    throw new AppError('MESSAGING_NOT_ALLOWED');
  }
};

/** 저장 메시지를 API 응답 DTO로 변환한다. attachments는 조회용 Presigned URL. */
const toChatMessageItem = async (message: {
  id: number;
  senderId: string;
  sender: { userType: UserType };
  messageType: MessageType;
  content: string;
  isFiltered: boolean;
  attachments: { fileKey: string }[];
  createdAt: Date;
}): Promise<ChatMessageItem> => {
  return {
    messageId: message.id,
    senderId: message.senderId,
    senderUserType: message.sender.userType,
    messageType: message.messageType,
    content: message.content,
    isFiltered: message.isFiltered,
    attachments: await toAttachmentViewUrls(message.attachments),
    createdAt: toIsoString(message.createdAt),
  };
};

/**
 * 채팅방 읽음 상태를 갱신한다.
 * - 활성 참여자만 처리 가능
 * - lastReadMessageId는 해당 방·joinedAt 이후 메시지여야 함
 * - 방-참여자당 1건만 유지하며, 전진만 허용(원자적 갱신)
 */
export const markChatRoomAsRead = async (
  authUser: AuthenticatedUser,
  roomId: number,
  body: MarkChatRoomAsReadBody
): Promise<MarkChatRoomAsReadResult> => {
  const room = await chatRepository.findRoomById(roomId);

  if (!room) {
    throw new AppError('ROOM_NOT_FOUND');
  }

  const participation = await chatRepository.findActiveParticipation(
    roomId,
    authUser.userId
  );

  if (!participation) {
    throw new AppError('FORBIDDEN');
  }

  const message = await chatRepository.findMessageInRoomAfterJoinedAt({
    roomId,
    messageId: body.lastReadMessageId,
    joinedAt: participation.joinedAt,
  });

  if (!message) {
    throw new AppError('MESSAGE_NOT_FOUND');
  }

  const readStatus = await chatRepository.advanceReadStatus({
    roomId,
    readerId: authUser.userId,
    lastReadMessageId: body.lastReadMessageId,
  });

  const participantIds = await chatRepository.findActiveParticipantIds(roomId);
  const partnerIds = participantIds.filter((id) => id !== authUser.userId);

  await emitChatRoomRead({
    roomId,
    readerId: authUser.userId,
    lastReadMessageId: readStatus.lastReadMessageId,
    readAt: toIsoString(readStatus.readAt),
    partnerIds,
  });

  return {
    lastReadMessageId: readStatus.lastReadMessageId,
    readAt: toIsoString(readStatus.readAt),
  };
};

/**
 * 채팅방에서 나간다.
 * - 활성 참여(leftAt IS NULL) row에 leftAt을 설정한다
 * - 이미 나간 상태면 ALREADY_LEFT, 참여 이력이 없으면 FORBIDDEN
 */
export const leaveChatRoom = async (
  authUser: AuthenticatedUser,
  roomId: number
): Promise<LeaveChatRoomResult> => {
  const room = await chatRepository.findRoomById(roomId);

  if (!room) {
    throw new AppError('ROOM_NOT_FOUND');
  }

  const leftAt = new Date();
  const result = await chatRepository.leaveActiveParticipation(
    roomId,
    authUser.userId,
    leftAt
  );

  if (result.count === 0) {
    const anyParticipation = await chatRepository.findAnyParticipation(
      roomId,
      authUser.userId
    );

    if (anyParticipation) {
      throw new AppError('ALREADY_LEFT');
    }

    throw new AppError('FORBIDDEN', '채팅방 참여 권한이 없습니다.');
  }

  return {
    roomId,
    leftAt: toIsoString(leftAt),
  };
};
