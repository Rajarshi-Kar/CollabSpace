import type { Server } from 'socket.io';
import { Redis } from 'ioredis';
import type { DomainEvent } from '@collabspace/shared';

/**
 * Subscribes to the domain-event channels published by emitDomainEvent
 * (lib/events.ts) and rebroadcasts them into the matching org room. This is
 * the only place that turns a persisted mutation into a realtime push, so
 * feature modules never talk to sockets directly.
 */
export function attachDomainEventBridge(io: Server) {
  const subscriber = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  subscriber.psubscribe('org:*:events');

  subscriber.on('pmessage', (_pattern, channel, message) => {
    const orgId = channel.split(':')[1];
    if (!orgId) return;
    try {
      const event = JSON.parse(message) as DomainEvent;
      io.to(`org:${orgId}`).emit('domain-event', event);
    } catch {
      // Malformed payloads are dropped rather than crashing the bridge.
    }
  });

  return subscriber;
}
