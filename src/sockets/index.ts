import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { registerChatSocketHandlers } from './chat.socket';
import { socketAuthMiddleware } from './socket.auth';
import type { ChatServer } from './socket.types';

let io: ChatServer | null = null;

/** 초기화된 Socket.IO 서버 인스턴스를 반환한다. 미초기화면 null. */
export const getChatIo = (): ChatServer | null => io;

/**
 * HTTP 서버에 Socket.IO를 붙이고 채팅 네임스페이스(/) 핸들러를 등록한다.
 * CORS는 REST와 동일하게 CORS_ORIGIN을 사용한다.
 */
export const initChatSocket = (httpServer: HttpServer): ChatServer => {
  const corsOrigins = (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  io = new Server(httpServer, {
    cors: {
      origin: corsOrigins.length > 0 ? corsOrigins : false,
      credentials: true,
    },
  });

  io.use(socketAuthMiddleware);

  io.on('connection', (socket) => {
    registerChatSocketHandlers(socket);
  });

  return io;
};
