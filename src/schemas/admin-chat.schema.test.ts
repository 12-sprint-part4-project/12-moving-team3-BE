import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  adminChatDetailQuerySchema,
  adminChatListQuerySchema,
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
