import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { verifyAccessToken } from '../lib/jwt.js';

export function createSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: { origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173', credentials: true },
  });

  const pubClient = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  const subClient = pubClient.duplicate();
  io.adapter(createAdapter(pubClient, subClient));

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('unauthorized'));
    try {
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.sub;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    // Rooms are joined per-resource by feature modules (documents, projects, channels)
    // as those are implemented in later phases.
    socket.on('room:join', (room: string) => socket.join(room));
    socket.on('room:leave', (room: string) => socket.leave(room));
  });

  return io;
}
