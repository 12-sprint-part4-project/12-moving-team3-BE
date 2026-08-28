import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { ChatRoomType, UserType } from '@prisma/client';
import type { AuthenticatedUser } from '../middlewares/auth.middleware';
import { AppError } from '../utils/app.error';

const chatRoomRepository = require('../repositories/chat-room.repository') as {
  findRoomDetailById: (roomId: number) => Promise<unknown | null>;
  findRoomById: (roomId: number) => Promise<{ id: number } | null>;
  leaveActiveParticipation: (
    roomId: number,
    userId: string,
    leftAt: Date
  ) => Promise<{ count: number }>;
  findAnyParticipation: (
    roomId: number,
    userId: string
  ) => Promise<{ leftAt: Date } | null>;
};

const chatReadRepository = require('../repositories/chat-read.repository') as {
  findPartnerReadStatus: (
    roomId: number,
    partnerId: string
  ) => Promise<unknown | null>;
};

const chatSocketService = require('./chat-socket.service') as {
  emitChatPartnerLeft: (payload: unknown) => Promise<void>;
};

const {
  getChatRoomDetail,
  leaveChatRoom,
} = require('./chat-room.service') as {
  getChatRoomDetail: typeof import('./chat-room.service').getChatRoomDetail;
  leaveChatRoom: typeof import('./chat-room.service').leaveChatRoom;
};

const USER_ID = '11111111-1111-4111-8111-111111111111';
const PARTNER_ID = '22222222-2222-4222-8222-222222222222';
const ROOM_ID = 1;
const UPDATED_AT = new Date('2026-08-20T00:00:00.000Z');
const LEFT_AT = new Date('2026-08-21T00:00:00.000Z');

const authUser = (): AuthenticatedUser => ({
  userId: USER_ID,
  userType: 'CUSTOMER',
});

const buildPartnerUser = () => ({
  id: PARTNER_ID,
  userType: UserType.MOVER,
  name: '김기사',
  nickname: '기사님',
  profileImageKey: null,
});

interface DetailRoomOverrides {
  estimateStatus?: 'SUBMITTED' | 'EXPIRED';
  quoteStatus?: 'REJECTED' | 'PENDING';
  partnerLeftAt?: Date | null;
}

const buildDetailRoom = (overrides: DetailRoomOverrides = {}) => ({
  id: ROOM_ID,
  roomType: ChatRoomType.GENERAL,
  quoteId: 10,
  updatedAt: UPDATED_AT,
  estimateRequest: {
    id: 5,
    status: overrides.estimateStatus ?? 'SUBMITTED',
    moveType: 'HOME',
    moveDate: new Date('2026-09-01T00:00:00.000Z'),
    departureAddress: '서울',
    arrivalAddress: '부산',
  },
  quote: {
    status: overrides.quoteStatus ?? 'PENDING',
  },
  participants: [
    {
      participantId: USER_ID,
      leftAt: null,
      user: {
        id: USER_ID,
        userType: UserType.CUSTOMER,
        name: '홍길동',
        nickname: '길동',
        profileImageKey: null,
      },
    },
    {
      participantId: PARTNER_ID,
      leftAt: overrides.partnerLeftAt ?? null,
      user: buildPartnerUser(),
    },
  ],
});

const originals = {
  findRoomDetailById: chatRoomRepository.findRoomDetailById,
  findRoomById: chatRoomRepository.findRoomById,
  findPartnerReadStatus: chatReadRepository.findPartnerReadStatus,
  leaveActiveParticipation: chatRoomRepository.leaveActiveParticipation,
  findAnyParticipation: chatRoomRepository.findAnyParticipation,
  emitChatPartnerLeft: chatSocketService.emitChatPartnerLeft,
};

const restoreMocks = () => {
  chatRoomRepository.findRoomDetailById = originals.findRoomDetailById;
  chatRoomRepository.findRoomById = originals.findRoomById;
  chatReadRepository.findPartnerReadStatus = originals.findPartnerReadStatus;
  chatRoomRepository.leaveActiveParticipation = originals.leaveActiveParticipation;
  chatRoomRepository.findAnyParticipation = originals.findAnyParticipation;
  chatSocketService.emitChatPartnerLeft = originals.emitChatPartnerLeft;
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

describe('getChatRoomDetail', () => {
  afterEach(() => restoreMocks());

  it('방이 없으면 ROOM_NOT_FOUND', async () => {
    chatRoomRepository.findRoomDetailById = async () => null;

    await assertRejectsWithCode(
      () => getChatRoomDetail(authUser(), ROOM_ID),
      'ROOM_NOT_FOUND'
    );
  });

  it('활성 참여자가 아니면 FORBIDDEN', async () => {
    chatRoomRepository.findRoomDetailById = async () => {
      const detail = buildDetailRoom({ partnerLeftAt: LEFT_AT });
      detail.participants[0].leftAt = LEFT_AT;
      return detail;
    };

    await assertRejectsWithCode(
      () => getChatRoomDetail(authUser(), ROOM_ID),
      'FORBIDDEN'
    );
  });

  it('종료 견적이면 isMessagingAllowed=false이고 estimateRequestStatus=EXPIRED', async () => {
    chatRoomRepository.findRoomDetailById = async () =>
      buildDetailRoom({ estimateStatus: 'EXPIRED' });
    chatReadRepository.findPartnerReadStatus = async () => null;

    const result = await getChatRoomDetail(authUser(), ROOM_ID);

    assert.equal(result.isMessagingAllowed, false);
    assert.equal(result.estimateRequestStatus, 'EXPIRED');
    assert.equal(result.partner.displayName, '김기사');
  });

  it('SUBMITTED 견적 요청이면 estimateRequestStatus=SUBMITTED', async () => {
    chatRoomRepository.findRoomDetailById = async () => buildDetailRoom();
    chatReadRepository.findPartnerReadStatus = async () => null;

    const result = await getChatRoomDetail(authUser(), ROOM_ID);

    assert.equal(result.estimateRequestStatus, 'SUBMITTED');
  });

  it('상대가 나갔으면 isPartnerLeft=true', async () => {
    chatRoomRepository.findRoomDetailById = async () =>
      buildDetailRoom({ partnerLeftAt: LEFT_AT });
    chatReadRepository.findPartnerReadStatus = async () => null;

    const result = await getChatRoomDetail(authUser(), ROOM_ID);

    assert.equal(result.isPartnerLeft, true);
    assert.equal(result.partnerLeftAt, LEFT_AT.toISOString());
  });
});

describe('leaveChatRoom', () => {
  afterEach(() => restoreMocks());

  it('이미 나간 상태면 ALREADY_LEFT', async () => {
    chatRoomRepository.findRoomById = async () => ({ id: ROOM_ID });
    chatRoomRepository.leaveActiveParticipation = async () => ({ count: 0 });
    chatRoomRepository.findAnyParticipation = async () => ({ leftAt: LEFT_AT });

    await assertRejectsWithCode(
      () => leaveChatRoom(authUser(), ROOM_ID),
      'ALREADY_LEFT'
    );
  });

  it('참여 이력 없으면 FORBIDDEN', async () => {
    chatRoomRepository.findRoomById = async () => ({ id: ROOM_ID });
    chatRoomRepository.leaveActiveParticipation = async () => ({ count: 0 });
    chatRoomRepository.findAnyParticipation = async () => null;

    await assertRejectsWithCode(
      () => leaveChatRoom(authUser(), ROOM_ID),
      'FORBIDDEN'
    );
  });

  it('성공 시 roomId·leftAt을 반환하고 partner-left를 emit한다', async () => {
    chatRoomRepository.findRoomById = async () => ({ id: ROOM_ID });
    chatRoomRepository.leaveActiveParticipation = async () => ({ count: 1 });
    const emitted: unknown[] = [];
    chatSocketService.emitChatPartnerLeft = async (payload: unknown) => {
      emitted.push(payload);
    };

    const result = await leaveChatRoom(authUser(), ROOM_ID);

    assert.equal(result.roomId, ROOM_ID);
    assert.ok(result.leftAt);
    assert.equal(emitted.length, 1);
  });
});
