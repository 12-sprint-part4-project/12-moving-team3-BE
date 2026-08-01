import type { ExtendedError } from 'socket.io';
import { verifyAccessToken } from '../utils/auth-jwt.util';
import type { ChatSocket } from './socket.types';

/**
 * Socket.IO 핸드셰이크 Access Token을 검증한다.
 * - `auth.token` 또는 `Authorization: Bearer ...` 헤더를 허용한다.
 * - 실패 시 연결을 거부한다.
 */
export const socketAuthMiddleware = (
  socket: ChatSocket,
  next: (err?: ExtendedError) => void
) => {
  try {
    const authToken =
      typeof socket.handshake.auth?.token === 'string'
        ? socket.handshake.auth.token.trim()
        : null;

    const header = socket.handshake.headers.authorization;
    const headerToken =
      typeof header === 'string' && header.startsWith('Bearer ')
        ? header.slice(7).trim()
        : null;

    const token = authToken || headerToken;

    if (!token) {
      next(new Error('UNAUTHORIZED'));
      return;
    }

    const payload = verifyAccessToken(token);

    socket.data.user = {
      userId: payload.sub,
      userType: payload.userType,
    };

    next();
  } catch {
    next(new Error('UNAUTHORIZED'));
  }
};
