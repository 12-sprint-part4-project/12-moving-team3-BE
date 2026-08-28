import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { MessageType, UserType } from '@prisma/client';
import type { AuthenticatedUser } from '../middlewares/auth.middleware';
import { AppError } from '../utils/app.error';

const chatRoomRepository = require('../repositories/chat-room.repository') as {
  findRoomById: (roomId: number) => Promise<{ id: number } | null>;
  findActiveParticipation: (
    roomId: number,
    userId: string,
    dbClient?: unknown
  ) => Promise<{ joinedAt: Date } | null>;
  findRoomForMessaging: (
    roomId: number,
    dbClient?: unknown
  ) => Promise<{
    estimateRequest: { status: string } | null;
    quote: { status: string } | null;
  } | null>;
};

const chatMessageRepository = require('../repositories/chat-message.repository') as {
  findMessagesByRoomCursor: (params: unknown) => Promise<{
    messages: unknown[];
    hasNext: boolean;
  }>;
  createTextMessage: (tx: unknown, data: unknown) => Promise<unknown>;
};

const chatAttachmentUtil = require('../utils/chat-attachment.util') as {
  toAttachmentViewUrls: (attachments: unknown[]) => Promise<string[]>;
};

const contentFilter = require('../utils/content-filter') as {
  filterChatContent: (content: string) => Promise<unknown>;
};

const prismaModule = require('../lib/prisma') as {
  prisma: { $transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown> };
};

const chatSocketService = require('./chat-socket.service') as {
  emitChatMessageCreated: (payload: unknown) => Promise<void>;
};

const s3Service = require('./s3.service') as {
  getObjectMetadata: (fileKey: string) => Promise<{
    contentLength: number;
    contentType: string;
  } | null>;
};

const {
  getChatMessages,
  sendChatMessage,
} = require('./chat-message.service') as {
  getChatMessages: typeof import('./chat-message.service').getChatMessages;
  sendChatMessage: typeof import('./chat-message.service').sendChatMessage;
};

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ROOM_ID = 1;
const JOINED_AT = new Date('2026-08-01T00:00:00.000Z');
const CREATED_AT = new Date('2026-08-15T00:00:00.000Z');

const VALID_ATTACHMENT_KEY =
  'chat-attachments/22222222-2222-4222-8222-222222222222_photo.jpg';

const authUser = (): AuthenticatedUser => ({
  userId: USER_ID,
  userType: 'CUSTOMER',
});

const originals = {
  findRoomById: chatRoomRepository.findRoomById,
  findActiveParticipation: chatRoomRepository.findActiveParticipation,
  findRoomForMessaging: chatRoomRepository.findRoomForMessaging,
  findMessagesByRoomCursor: chatMessageRepository.findMessagesByRoomCursor,
  createTextMessage: chatMessageRepository.createTextMessage,
  toAttachmentViewUrls: chatAttachmentUtil.toAttachmentViewUrls,
  filterChatContent: contentFilter.filterChatContent,
  prismaTransaction: prismaModule.prisma.$transaction,
  emitChatMessageCreated: chatSocketService.emitChatMessageCreated,
  getObjectMetadata: s3Service.getObjectMetadata,
};

const restoreMocks = () => {
  chatRoomRepository.findRoomById = originals.findRoomById;
  chatRoomRepository.findActiveParticipation = originals.findActiveParticipation;
  chatRoomRepository.findRoomForMessaging = originals.findRoomForMessaging;
  chatMessageRepository.findMessagesByRoomCursor =
    originals.findMessagesByRoomCursor;
  chatMessageRepository.createTextMessage = originals.createTextMessage;
  chatAttachmentUtil.toAttachmentViewUrls = originals.toAttachmentViewUrls;
  contentFilter.filterChatContent = originals.filterChatContent;
  prismaModule.prisma.$transaction = originals.prismaTransaction;
  chatSocketService.emitChatMessageCreated = originals.emitChatMessageCreated;
  s3Service.getObjectMetadata = originals.getObjectMetadata;
};

const assertRejectsWithCode = async (
  fn: () => Promise<unknown>,
  code: string
) => {
  await assert.rejects(fn, (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, code);
    return true;
  });
};

describe('getChatMessages', () => {
  afterEach(() => restoreMocks());

  it('활성 참여자가 아니면 FORBIDDEN', async () => {
    chatRoomRepository.findRoomById = async () => ({ id: ROOM_ID });
    chatRoomRepository.findActiveParticipation = async () => null;

    await assertRejectsWithCode(
      () => getChatMessages(authUser(), ROOM_ID, { limit: 30 }),
      'FORBIDDEN'
    );
  });

  it('joinedAt 이후 메시지와 pagination meta를 반환한다', async () => {
    chatRoomRepository.findRoomById = async () => ({ id: ROOM_ID });
    chatRoomRepository.findActiveParticipation = async () => ({
      joinedAt: JOINED_AT,
    });
    chatMessageRepository.findMessagesByRoomCursor = async () => ({
      messages: [
        {
          id: 100,
          senderId: USER_ID,
          sender: { userType: UserType.CUSTOMER },
          messageType: MessageType.TEXT,
          content: '안녕',
          isFiltered: false,
          attachments: [],
          createdAt: CREATED_AT,
        },
      ],
      hasNext: true,
    });
    chatAttachmentUtil.toAttachmentViewUrls = async () => [];

    const result = await getChatMessages(authUser(), ROOM_ID, { limit: 30 });

    assert.equal(result.data.messages.length, 1);
    assert.equal(result.data.messages[0].messageId, 100);
    assert.equal(result.data.messages[0].content, '안녕');
    assert.equal(result.meta.hasNext, true);
    assert.equal(result.meta.nextCursor, 100);
  });
});

describe('sendChatMessage', () => {
  afterEach(() => restoreMocks());

  it('isMessagingAllowed=false면 MESSAGING_NOT_ALLOWED', async () => {
    chatRoomRepository.findRoomForMessaging = async () => ({
      estimateRequest: { status: 'EXPIRED' },
      quote: null,
    });
    chatRoomRepository.findActiveParticipation = async () => ({
      joinedAt: JOINED_AT,
    });

    await assertRejectsWithCode(
      () =>
        sendChatMessage(authUser(), ROOM_ID, {
          messageType: 'TEXT',
          content: '안녕',
        }),
      'MESSAGING_NOT_ALLOWED'
    );
  });

  it('TEXT mask 필터 시 filterAction·content를 반환한다', async () => {
    contentFilter.filterChatContent = async () => ({
      maskedContent: '연락처 [전화번호]',
      isFiltered: true,
      rawContent: '연락처 010-1234-5678',
      decision: {
        action: 'mask',
        reasons: [{ code: 'PERSONAL_INFO_PHONE', method: 'regex' }],
      },
    });
    prismaModule.prisma.$transaction = async (fn) => fn({});
    chatRoomRepository.findRoomForMessaging = async () => ({
      estimateRequest: { status: 'SUBMITTED' },
      quote: null,
    });
    chatRoomRepository.findActiveParticipation = async () => ({
      joinedAt: JOINED_AT,
    });
    chatMessageRepository.createTextMessage = async () => ({
      id: 200,
      senderId: USER_ID,
      sender: { userType: UserType.CUSTOMER },
      messageType: MessageType.TEXT,
      content: '연락처 [전화번호]',
      isFiltered: true,
      attachments: [],
      createdAt: CREATED_AT,
    });
    chatAttachmentUtil.toAttachmentViewUrls = async () => [];
    chatSocketService.emitChatMessageCreated = async () => {};

    const result = await sendChatMessage(authUser(), ROOM_ID, {
      messageType: 'TEXT',
      content: '연락처 010-1234-5678',
    });

    assert.equal(result.filterAction, 'mask');
    assert.deepEqual(result.filterReasonCodes, ['PERSONAL_INFO_PHONE']);
    assert.equal(result.content, '연락처 [전화번호]');
    assert.equal(result.isFiltered, true);
  });

  it('IMAGE 첨부 key 중복이면 INVALID_REQUEST', async () => {
    chatRoomRepository.findRoomForMessaging = async () => ({
      estimateRequest: { status: 'SUBMITTED' },
      quote: null,
    });
    chatRoomRepository.findActiveParticipation = async () => ({
      joinedAt: JOINED_AT,
    });

    await assertRejectsWithCode(
      () =>
        sendChatMessage(authUser(), ROOM_ID, {
          messageType: 'IMAGE',
          attachments: [VALID_ATTACHMENT_KEY, VALID_ATTACHMENT_KEY],
        }),
      'INVALID_REQUEST'
    );
  });

  it('IMAGE 잘못된 key 형식이면 INVALID_REQUEST', async () => {
    chatRoomRepository.findRoomForMessaging = async () => ({
      estimateRequest: { status: 'SUBMITTED' },
      quote: null,
    });
    chatRoomRepository.findActiveParticipation = async () => ({
      joinedAt: JOINED_AT,
    });

    await assertRejectsWithCode(
      () =>
        sendChatMessage(authUser(), ROOM_ID, {
          messageType: 'IMAGE',
          attachments: ['invalid-key'],
        }),
      'INVALID_REQUEST'
    );
  });

  it('IMAGE S3에 없으면 INVALID_REQUEST', async () => {
    chatRoomRepository.findRoomForMessaging = async () => ({
      estimateRequest: { status: 'SUBMITTED' },
      quote: null,
    });
    chatRoomRepository.findActiveParticipation = async () => ({
      joinedAt: JOINED_AT,
    });
    s3Service.getObjectMetadata = async () => null;

    await assertRejectsWithCode(
      () =>
        sendChatMessage(authUser(), ROOM_ID, {
          messageType: 'IMAGE',
          attachments: [VALID_ATTACHMENT_KEY],
        }),
      'INVALID_REQUEST'
    );
  });

  it('IMAGE 용량 초과면 IMAGE_SIZE_EXCEEDED', async () => {
    chatRoomRepository.findRoomForMessaging = async () => ({
      estimateRequest: { status: 'SUBMITTED' },
      quote: null,
    });
    chatRoomRepository.findActiveParticipation = async () => ({
      joinedAt: JOINED_AT,
    });
    s3Service.getObjectMetadata = async () => ({
      contentLength: 6 * 1024 * 1024,
      contentType: 'image/jpeg',
    });

    await assertRejectsWithCode(
      () =>
        sendChatMessage(authUser(), ROOM_ID, {
          messageType: 'IMAGE',
          attachments: [VALID_ATTACHMENT_KEY],
        }),
      'IMAGE_SIZE_EXCEEDED'
    );
  });
});
