import type { Response } from 'express';

/** userId → 열린 SSE Response 집합 */
const clientsByUserId = new Map<string, Set<Response>>();

const HEARTBEAT_INTERVAL_MS = 20_000;

interface SseConnection {
  userId: string;
  res: Response;
  heartbeatTimer: ReturnType<typeof setInterval>;
}

/**
 * SSE 연결 등록. 하트비트(주석 이벤트)로 프록시 idle timeout 방지.
 */
export const subscribe = (userId: string, res: Response): void => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // nginx 등에서 버퍼링하지 않도록
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  let clients = clientsByUserId.get(userId);
  if (!clients) {
    clients = new Set();
    clientsByUserId.set(userId, clients);
  }
  clients.add(res);

  // 연결 직후 빈 주석으로 스트림 오픈 확인
  res.write(': connected\n\n');

  const heartbeatTimer = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(heartbeatTimer);
      return;
    }
    res.write(': heartbeat\n\n');
  }, HEARTBEAT_INTERVAL_MS);

  const connection: SseConnection = { userId, res, heartbeatTimer };

  const cleanup = () => {
    clearInterval(connection.heartbeatTimer);
    const set = clientsByUserId.get(userId);
    if (!set) {
      return;
    }
    set.delete(res);
    if (set.size === 0) {
      clientsByUserId.delete(userId);
    }
  };

  res.on('close', cleanup);
  res.on('error', cleanup);
};

/** 특정 유저의 모든 SSE 클라이언트에 이벤트 전송 */
export const publish = (
  userId: string,
  event: string,
  data: unknown
): void => {
  const clients = clientsByUserId.get(userId);
  if (!clients || clients.size === 0) {
    return;
  }

  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  for (const res of clients) {
    if (res.writableEnded) {
      continue;
    }
    res.write(payload);
  }
};

export const publishNotification = (userId: string, notification: unknown) => {
  publish(userId, 'notification', notification);
};

export const publishUnreadCount = (userId: string, unreadCount: number) => {
  publish(userId, 'unread-count', { unreadCount });
};

/**
 * 대량 fan-out 후 FE가 목록·미읽음을 재조회하도록 하는 이벤트.
 * FE 핸들러는 후속 — BE는 이벤트만 예약해 둔다.
 */
export const publishNotificationRefresh = (userId: string) => {
  publish(userId, 'notification-refresh', {});
};
