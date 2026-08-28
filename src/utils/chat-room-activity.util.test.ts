import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  compareChatRoomsByLastActivityDesc,
  computeChatRoomLastActivityAt,
} from './chat-room-activity.util';

describe('computeChatRoomLastActivityAt', () => {
  it('roomCreatedAt·joinedAt·lastMessage 중 최신 시각을 반환한다', () => {
    const roomCreatedAt = new Date('2026-08-01T00:00:00.000Z');
    const joinedAt = new Date('2026-08-10T00:00:00.000Z');
    const lastMessageCreatedAt = new Date('2026-08-20T00:00:00.000Z');

    const result = computeChatRoomLastActivityAt({
      roomCreatedAt,
      joinedAt,
      lastMessageCreatedAt,
    });

    assert.equal(result.toISOString(), lastMessageCreatedAt.toISOString());
  });

  it('lastMessage가 없으면 joinedAt과 roomCreatedAt 중 최신을 사용한다', () => {
    const roomCreatedAt = new Date('2026-08-15T00:00:00.000Z');
    const joinedAt = new Date('2026-08-10T00:00:00.000Z');

    const result = computeChatRoomLastActivityAt({
      roomCreatedAt,
      joinedAt,
      lastMessageCreatedAt: null,
    });

    assert.equal(result.toISOString(), roomCreatedAt.toISOString());
  });
});

describe('compareChatRoomsByLastActivityDesc', () => {
  it('lastActivityAt 내림차순으로 정렬한다', () => {
    const rooms = [
      { roomId: 1, lastActivityAt: '2026-08-10T00:00:00.000Z' },
      { roomId: 2, lastActivityAt: '2026-08-20T00:00:00.000Z' },
    ];

    rooms.sort(compareChatRoomsByLastActivityDesc);

    assert.deepEqual(rooms.map((room) => room.roomId), [2, 1]);
  });

  it('lastActivityAt 동률이면 roomId 내림차순', () => {
    const rooms = [
      { roomId: 1, lastActivityAt: '2026-08-10T00:00:00.000Z' },
      { roomId: 3, lastActivityAt: '2026-08-10T00:00:00.000Z' },
    ];

    rooms.sort(compareChatRoomsByLastActivityDesc);

    assert.deepEqual(rooms.map((room) => room.roomId), [3, 1]);
  });
});
