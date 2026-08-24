import type { MessageType, UserType } from '@prisma/client';
import type {
  ChatMessageItem,
  ChatMessagesResult,
  MarkChatRoomAsReadResult,
} from '../dtos/chat.dto';
import {
  CHAT_ATTACHMENT_ALLOWED_CONTENT_TYPES,
  CHAT_ATTACHMENT_MAX_SIZE,
  isValidChatAttachmentKey,
} from '../constants/chat-attachment.constants';
import { isMessagingAllowedForChatRoom } from '../constants/chat.constants';
import { prisma } from '../lib/prisma';
import type { AuthenticatedUser } from '../middlewares/auth.middleware';
import * as chatRepository from '../repositories/chat.repository';
import type {
  GetChatMessagesQuery,
  MarkChatRoomAsReadBody,
  SendChatMessageBody,
} from '../schemas/chat.schema';
import { AppError } from '../utils/app.error';
import {
  assertActiveChatParticipation,
  assertChatRoomWithActiveParticipation,
} from '../utils/chat-access.util';
import { toAttachmentViewUrls } from '../utils/chat-attachment.util';
import { filterChatContent } from '../utils/chat-content-filter.util';
import { buildCursorPaginationMeta } from '../utils/cursor-pagination.util';
import {
  emitChatMessageCreated,
  emitChatRoomRead,
} from './chat-socket.service';
import { getObjectMetadata } from './s3.service';

/** Date를 ISO 8601 문자열로 변환한다. */
const toIsoString = (date: Date) => date.toISOString();

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
  const participation = await assertChatRoomWithActiveParticipation(
    roomId,
    authUser.userId
  );

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
    meta: buildCursorPaginationMeta(hasNext, oldestMessage?.messageId),
  };
};

/**
 * TEXT/IMAGE 메시지를 전송한다.
 * - 활성 참여자만 발송 가능
 * - isMessagingAllowed가 false이면 거부
 * - TEXT: 필터 시 안내 문구로 저장, 원문은 rawLog 보관
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

/** TEXT 메시지 저장·필터(전화·계좌·욕설 안내 문구)·재참여 처리를 수행한다. */
const sendTextMessage = async (
  authUser: AuthenticatedUser,
  roomId: number,
  content: string
): Promise<ChatMessageItem> => {
  const { maskedContent, isFiltered, rawContent } =
    await filterChatContent(content);

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

  await assertActiveChatParticipation(roomId, userId, dbClient);

  if (
    !isMessagingAllowedForChatRoom({
      estimateRequestStatus: room.estimateRequest?.status,
      quoteStatus: room.quote?.status,
    })
  ) {
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
  const participation = await assertChatRoomWithActiveParticipation(
    roomId,
    authUser.userId
  );

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

