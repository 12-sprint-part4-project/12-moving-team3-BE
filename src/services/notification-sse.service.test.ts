import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Response } from 'express';
import {
  publishNotification,
  publishNotificationRefresh,
  publishUnreadCount,
  subscribe,
} from './notification-sse.service';

interface FakeResponse {
  headers: Record<string, string>;
  writes: string[];
  writableEnded: boolean;
  handlers: Record<string, () => void>;
  setHeader: (name: string, value: string) => void;
  write: (chunk: string) => boolean;
  on: (event: string, handler: () => void) => void;
  flushHeaders: () => void;
}

const createFakeResponse = (): FakeResponse => {
  const fake: FakeResponse = {
    headers: {},
    writes: [],
    writableEnded: false,
    handlers: {},
    setHeader(name, value) {
      fake.headers[name] = value;
    },
    write(chunk) {
      fake.writes.push(chunk);
      return true;
    },
    on(event, handler) {
      fake.handlers[event] = handler;
    },
    flushHeaders() {
      // no-op
    },
  };
  return fake;
};

const asResponse = (fake: FakeResponse): Response =>
  fake as unknown as Response;

/** 하트비트 setInterval을 정리해 테스트 프로세스에 핸들이 남지 않게 한다 */
const closeConnection = (fake: FakeResponse): void => {
  fake.handlers.close?.();
};

describe('subscribe', () => {
  it('SSE 헤더 4종을 설정하고 연결 확인 주석을 1회 쓴다', () => {
    const res = createFakeResponse();

    subscribe('user-1', asResponse(res));

    assert.equal(
      res.headers['Content-Type'],
      'text/event-stream; charset=utf-8'
    );
    assert.equal(res.headers['Cache-Control'], 'no-cache, no-transform');
    assert.equal(res.headers['Connection'], 'keep-alive');
    assert.equal(res.headers['X-Accel-Buffering'], 'no');
    assert.deepEqual(res.writes, [': connected\n\n']);

    closeConnection(res);
  });
});

describe('publishNotification / publishUnreadCount / publishNotificationRefresh', () => {
  it('publishNotification은 구독 중인 클라이언트에 notification 이벤트를 쓴다', () => {
    const res = createFakeResponse();
    subscribe('user-2', asResponse(res));

    publishNotification('user-2', { id: 1, content: '알림' });

    assert.equal(
      res.writes[1],
      `event: notification\ndata: ${JSON.stringify({ id: 1, content: '알림' })}\n\n`
    );

    closeConnection(res);
  });

  it('publishUnreadCount는 unread-count 이벤트로 { unreadCount }를 쓴다', () => {
    const res = createFakeResponse();
    subscribe('user-3', asResponse(res));

    publishUnreadCount('user-3', 5);

    assert.equal(
      res.writes[1],
      `event: unread-count\ndata: ${JSON.stringify({ unreadCount: 5 })}\n\n`
    );

    closeConnection(res);
  });

  it('publishNotificationRefresh는 notification-refresh 이벤트로 빈 객체를 쓴다', () => {
    const res = createFakeResponse();
    subscribe('user-4', asResponse(res));

    publishNotificationRefresh('user-4');

    assert.equal(res.writes[1], 'event: notification-refresh\ndata: {}\n\n');

    closeConnection(res);
  });

  it('구독 중인 클라이언트가 없으면 아무 것도 하지 않는다', () => {
    assert.doesNotThrow(() => publishNotification('no-such-user', {}));
  });

  it('writableEnded인 클라이언트는 건너뛴다', () => {
    const res = createFakeResponse();
    subscribe('user-5', asResponse(res));
    res.writableEnded = true;

    publishNotification('user-5', { id: 1 });

    assert.deepEqual(res.writes, [': connected\n\n']);

    closeConnection(res);
  });

  it('같은 유저의 여러 클라이언트(멀티탭) 모두에 이벤트를 쓴다', () => {
    const res1 = createFakeResponse();
    const res2 = createFakeResponse();
    subscribe('user-6', asResponse(res1));
    subscribe('user-6', asResponse(res2));

    publishUnreadCount('user-6', 2);

    assert.equal(res1.writes.length, 2);
    assert.equal(res2.writes.length, 2);

    closeConnection(res1);
    closeConnection(res2);
  });

  it('close 이벤트 이후에는 더 이상 해당 클라이언트에 쓰지 않는다', () => {
    const res = createFakeResponse();
    subscribe('user-7', asResponse(res));
    closeConnection(res);

    publishUnreadCount('user-7', 9);

    assert.deepEqual(res.writes, [': connected\n\n']);
  });
});
