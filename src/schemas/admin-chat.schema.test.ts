import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  adminChatDetailQuerySchema,
  adminChatListQuerySchema,
  adminChatMessagesQuerySchema,
  adminChatRoomParamsSchema,
} from './admin-chat.schema';

describe('adminChatListQuerySchema', () => {
  it('id를 숫자로 변환하고 userName을 trim한다', () => {
    const result = adminChatListQuerySchema.parse({
      id: '26',
      userName: '  홍길동  ',
    });

    assert.equal(result.id, 26);
    assert.equal(result.userName, '홍길동');
  });

  it('userName이 공백만 있으면 검증에 실패한다', () => {
    const result = adminChatListQuerySchema.safeParse({ userName: '   ' });

    assert.equal(result.success, false);
  });

  it('roomType enum만 허용한다', () => {
    assert.equal(
      adminChatListQuerySchema.parse({ roomType: 'GENERAL' }).roomType,
      'GENERAL'
    );

    const invalid = adminChatListQuerySchema.safeParse({ roomType: 'INVALID' });
    assert.equal(invalid.success, false);
  });
});

describe('adminChatDetailQuerySchema', () => {
  it('page/pageSize 없이 파싱한다', () => {
    const result = adminChatDetailQuerySchema.parse({
      id: '1',
      userName: '김민수',
      roomType: 'COMMUNITY',
    });

    assert.equal(result.id, 1);
    assert.equal(result.userName, '김민수');
    assert.equal(result.roomType, 'COMMUNITY');
    assert.equal('page' in result, false);
    assert.equal('pageSize' in result, false);
  });
});

describe('adminChatRoomParamsSchema', () => {
  it('roomId 문자열을 양의 정수로 변환한다', () => {
    const result = adminChatRoomParamsSchema.parse({ roomId: '26' });

    assert.equal(result.roomId, 26);
  });

  it('roomId가 0이거나 음수이면 검증에 실패한다', () => {
    assert.equal(
      adminChatRoomParamsSchema.safeParse({ roomId: '0' }).success,
      false
    );
    assert.equal(
      adminChatRoomParamsSchema.safeParse({ roomId: '-1' }).success,
      false
    );
  });
});

describe('adminChatMessagesQuerySchema', () => {
  it('limit이 없으면 기본값 30을 사용한다', () => {
    const result = adminChatMessagesQuerySchema.parse({});

    assert.equal(result.limit, 30);
  });

  it('before와 limit을 10진수 정수로 파싱한다', () => {
    const result = adminChatMessagesQuerySchema.parse({
      before: '150',
      limit: '50',
    });

    assert.equal(result.before, 150);
    assert.equal(result.limit, 50);
  });

  it('limit 최소·최대 경계값을 검증한다', () => {
    assert.equal(adminChatMessagesQuerySchema.parse({ limit: '1' }).limit, 1);
    assert.equal(
      adminChatMessagesQuerySchema.parse({ limit: '100' }).limit,
      100
    );
    assert.equal(
      adminChatMessagesQuerySchema.safeParse({ limit: '0' }).success,
      false
    );
    assert.equal(
      adminChatMessagesQuerySchema.safeParse({ limit: '101' }).success,
      false
    );
  });

  it('잘못된 숫자 표기는 거부한다', () => {
    assert.equal(
      adminChatMessagesQuerySchema.safeParse({ before: '1e3' }).success,
      false
    );
    assert.equal(
      adminChatMessagesQuerySchema.safeParse({ limit: '0x10' }).success,
      false
    );
  });
});
