import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { verifyAccessToken } from '../lib/jwt.js';
import { authorizeRoom } from './rooms.js';
import { listPresentUserIds, markAbsent, markPresent } from './presence.js';
import { attachDomainEventBridge } from './eventBridge.js';

export function createSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: { origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173', credentials: true },
  });

  const pubClient = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  const subClient = pubClient.duplicate();
  io.adapter(createAdapter(pubClient, subClient));
  attachDomainEventBridge(io);

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
    const userId = socket.data.userId as string;
    const joinedRooms = new Set<string>();

    socket.on('room:join', async (room: string, ack?: (ok: boolean) => void) => {
      const auth = await authorizeRoom(room, userId);
      if (!auth.allowed) {
        ack?.(false);
        return;
      }
      socket.join(room);
      joinedRooms.add(room);
      await markPresent(room, userId, socket.id);
      const present = await listPresentUserIds(room);
      io.to(room).emit('presence:update', { room, userIds: present });
      ack?.(true);
    });

    // Typing indicators are pure ephemeral fan-out — no persistence, no
    // audit log, no domain event — so they skip emitDomainEvent entirely
    // and go straight to the room.
    socket.on('typing:start', (room: string) => {
      if (!joinedRooms.has(room)) return;
      socket.to(room).emit('typing:update', { room, userId, typing: true });
    });

    socket.on('typing:stop', (room: string) => {
      if (!joinedRooms.has(room)) return;
      socket.to(room).emit('typing:update', { room, userId, typing: false });
    });

    socket.on('room:leave', async (room: string) => {
      socket.leave(room);
      joinedRooms.delete(room);
      await markAbsent(room, userId, socket.id);
      const present = await listPresentUserIds(room);
      io.to(room).emit('presence:update', { room, userIds: present });
    });

    socket.on('disconnect', async () => {
      for (const room of joinedRooms) {
        await markAbsent(room, userId, socket.id);
        const present = await listPresentUserIds(room);
        io.to(room).emit('presence:update', { room, userIds: present });
      }
    });
  });

  return io;
}
