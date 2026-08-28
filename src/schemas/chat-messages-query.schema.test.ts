import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { chatMessagesQuerySchema } from './chat-messages-query.schema';

describe('chatMessagesQuerySchema', () => {
  it('빈 query면 limit=30 기본값을 적용한다', () => {
    assert.deepEqual(chatMessagesQuerySchema.parse({}), { limit: 30 });
  });

  it('before·limit를 10진수 문자열에서 변환한다', () => {
    assert.deepEqual(
      chatMessagesQuerySchema.parse({ before: '100', limit: '50' }),
      { before: 100, limit: 50 }
    );
  });

  it('limit가 100을 초과하면 검증에 실패한다', () => {
    assert.equal(
      chatMessagesQuerySchema.safeParse({ limit: '101' }).success,
      false
    );
  });

  it('before가 0이면 검증에 실패한다', () => {
    assert.equal(
      chatMessagesQuerySchema.safeParse({ before: '0' }).success,
      false
    );
  });

  it('1e3·0x64 등 비10진 표기는 거부한다', () => {
    assert.equal(
      chatMessagesQuerySchema.safeParse({ before: '1e3' }).success,
      false
    );
    assert.equal(
      chatMessagesQuerySchema.safeParse({ limit: '0x64' }).success,
      false
    );
  });
});
