import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  chatRoomIdParamsSchema,
  createChatRoomBodySchema,
  markChatRoomAsReadBodySchema,
  sendChatMessageBodySchema,
} from './chat.schema';

const MOVER_ID = '11111111-1111-4111-8111-111111111111';

describe('createChatRoomBodySchema', () => {
  it('GENERAL 견적 방 body를 파싱한다', () => {
    assert.deepEqual(
      createChatRoomBodySchema.parse({
        moverId: MOVER_ID,
        estimateRequestId: 10,
        roomType: 'GENERAL',
      }),
      {
        moverId: MOVER_ID,
        estimateRequestId: 10,
        roomType: 'GENERAL',
      }
    );
  });

  it('DESIGNATED 견적 방 body를 파싱한다', () => {
    assert.deepEqual(
      createChatRoomBodySchema.parse({
        moverId: MOVER_ID,
        designatedMoverId: 5,
        roomType: 'DESIGNATED',
      }),
      {
        moverId: MOVER_ID,
        designatedMoverId: 5,
        roomType: 'DESIGNATED',
      }
    );
  });

  it('COMMUNITY 방 body를 파싱한다', () => {
    assert.deepEqual(
      createChatRoomBodySchema.parse({
        moverId: MOVER_ID,
        communityPostId: 3,
        roomType: 'COMMUNITY',
      }),
      {
        moverId: MOVER_ID,
        communityPostId: 3,
        roomType: 'COMMUNITY',
      }
    );
  });

  it('잘못된 roomType이면 검증에 실패한다', () => {
    assert.equal(
      createChatRoomBodySchema.safeParse({
        moverId: MOVER_ID,
        roomType: 'INVALID',
      }).success,
      false
    );
  });

  it('moverId가 uuid가 아니면 검증에 실패한다', () => {
    assert.equal(
      createChatRoomBodySchema.safeParse({
        moverId: 'not-a-uuid',
        estimateRequestId: 1,
        roomType: 'GENERAL',
      }).success,
      false
    );
  });
});

describe('chatRoomIdParamsSchema', () => {
  it('roomId를 양수 정수로 변환한다', () => {
    assert.deepEqual(chatRoomIdParamsSchema.parse({ roomId: '12' }), {
      roomId: 12,
    });
  });

  it('0·음수·문자면 검증에 실패한다', () => {
    assert.equal(chatRoomIdParamsSchema.safeParse({ roomId: '0' }).success, false);
    assert.equal(chatRoomIdParamsSchema.safeParse({ roomId: '-1' }).success, false);
    assert.equal(chatRoomIdParamsSchema.safeParse({ roomId: 'abc' }).success, false);
  });
});

describe('sendChatMessageBodySchema', () => {
  it('TEXT content를 trim한다', () => {
    assert.deepEqual(
      sendChatMessageBodySchema.parse({
        messageType: 'TEXT',
        content: '  안녕하세요  ',
      }),
      {
        messageType: 'TEXT',
        content: '안녕하세요',
      }
    );
  });

  it('TEXT 빈 문자열이면 검증에 실패한다', () => {
    assert.equal(
      sendChatMessageBodySchema.safeParse({
        messageType: 'TEXT',
        content: '   ',
      }).success,
      false
    );
  });

  it('TEXT 2000자를 초과하면 검증에 실패한다', () => {
    assert.equal(
      sendChatMessageBodySchema.safeParse({
        messageType: 'TEXT',
        content: 'a'.repeat(2001),
      }).success,
      false
    );
  });

  it('TEXT 2000자와 IMAGE 첨부 1개를 허용한다', () => {
    assert.equal(
      sendChatMessageBodySchema.safeParse({
        messageType: 'TEXT',
        content: 'a'.repeat(2000),
      }).success,
      true
    );
    assert.equal(
      sendChatMessageBodySchema.safeParse({
        messageType: 'IMAGE',
        attachments: ['key-0'],
      }).success,
      true
    );
  });

  it('IMAGE attachments 1~5개 전체 범위를 허용한다', () => {
    const keys = Array.from({ length: 5 }, (_, index) => `key-${index}`);
    assert.deepEqual(
      sendChatMessageBodySchema.parse({
        messageType: 'IMAGE',
        attachments: keys,
      }),
      {
        messageType: 'IMAGE',
        attachments: keys,
      }
    );
  });

  it('IMAGE attachments가 비어 있거나 6개 이상이면 검증에 실패한다', () => {
    assert.equal(
      sendChatMessageBodySchema.safeParse({
        messageType: 'IMAGE',
        attachments: [],
      }).success,
      false
    );
    assert.equal(
      sendChatMessageBodySchema.safeParse({
        messageType: 'IMAGE',
        attachments: Array.from({ length: 6 }, () => 'key'),
      }).success,
      false
    );
  });
});

describe('markChatRoomAsReadBodySchema', () => {
  it('lastReadMessageId를 양수 정수로 파싱한다', () => {
    assert.deepEqual(
      markChatRoomAsReadBodySchema.parse({ lastReadMessageId: 100 }),
      { lastReadMessageId: 100 }
    );
  });

  it('0·음수면 검증에 실패한다', () => {
    assert.equal(
      markChatRoomAsReadBodySchema.safeParse({ lastReadMessageId: 0 }).success,
      false
    );
    assert.equal(
      markChatRoomAsReadBodySchema.safeParse({ lastReadMessageId: -1 }).success,
      false
    );
  });
});
