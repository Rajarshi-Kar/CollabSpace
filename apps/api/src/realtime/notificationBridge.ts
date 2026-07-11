import type { Server } from 'socket.io';
import { Redis } from 'ioredis';

/**
 * Subscribes to per-user notification channels published by lib/notify.ts
 * and forwards them into that user's private socket room. Separate from
 * eventBridge.ts because notifications target one specific user rather than
 * a room every member of a resource can see.
 */
export function attachNotificationBridge(io: Server) {
  const subscriber = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  subscriber.psubscribe('user:*:notifications');

  subscriber.on('pmessage', (_pattern, channel, message) => {
    const userId = channel.split(':')[1];
    if (!userId) return;
    try {
      io.to(`user:${userId}`).emit('notification', JSON.parse(message));
    } catch {
      // Malformed payloads are dropped rather than crashing the bridge.
    }
  });

  return subscriber;
}
