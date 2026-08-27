import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ChatRoomType } from '@prisma/client';
import { buildAdminChatListWhere } from './admin-chat.repository';

describe('buildAdminChatListWhere', () => {
  it('조건이 없으면 빈 where를 반환한다', () => {
    const where = buildAdminChatListWhere({});

    assert.deepEqual(where, {});
  });

  it('id가 있으면 정확히 반영한다', () => {
    const where = buildAdminChatListWhere({ id: 26 });

    assert.deepEqual(where, { id: 26 });
  });

  it('id=0도 undefined와 구분해 where.id에 반영한다', () => {
    const where = buildAdminChatListWhere({ id: 0 });

    assert.deepEqual(where, { id: 0 });
  });

  it('roomType이 있으면 정확히 반영한다', () => {
    const where = buildAdminChatListWhere({ roomType: ChatRoomType.COMMUNITY });

    assert.deepEqual(where, { roomType: ChatRoomType.COMMUNITY });
  });

  it('userName은 참여자 user.name 또는 user.nickname을 대소문자 구분 없이 검색한다', () => {
    const where = buildAdminChatListWhere({ userName: '홍길동' });

    assert.deepEqual(where, {
      participants: {
        some: {
          user: {
            OR: [
              { name: { contains: '홍길동', mode: 'insensitive' } },
              { nickname: { contains: '홍길동', mode: 'insensitive' } },
            ],
          },
        },
      },
    });
  });

  it('id, roomType, userName이 동시에 전달되면 모두 같은 where에 결합된다', () => {
    const where = buildAdminChatListWhere({
      id: 12,
      roomType: ChatRoomType.GENERAL,
      userName: '김민수',
    });

    assert.deepEqual(where, {
      id: 12,
      roomType: ChatRoomType.GENERAL,
      participants: {
        some: {
          user: {
            OR: [
              { name: { contains: '김민수', mode: 'insensitive' } },
              { nickname: { contains: '김민수', mode: 'insensitive' } },
            ],
          },
        },
      },
    });
  });
});
