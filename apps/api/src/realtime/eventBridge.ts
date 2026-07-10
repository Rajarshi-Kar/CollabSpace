import type { Server } from 'socket.io';
import { Redis } from 'ioredis';
import type { DomainEvent } from '@collabspace/shared';

// message.sent events carry a channelId in their payload and must only
// reach that channel's room — routing them to the whole org room would leak
// private-channel and DM content to every org member.
const CHANNEL_SCOPED_EVENT_TYPES = new Set(['message.sent']);

function targetRoom(event: DomainEvent): string {
  if (CHANNEL_SCOPED_EVENT_TYPES.has(event.type)) {
    const channelId = (event.payload as { channelId?: string } | undefined)?.channelId;
    if (channelId) return `channel:${channelId}`;
  }
  return `org:${event.organizationId}`;
}

/**
 * Subscribes to the domain-event channels published by emitDomainEvent
 * (lib/events.ts) and rebroadcasts them into the matching room. This is the
 * only place that turns a persisted mutation into a realtime push, so
 * feature modules never talk to sockets directly.
 */
export function attachDomainEventBridge(io: Server) {
  const subscriber = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  subscriber.psubscribe('org:*:events');

  subscriber.on('pmessage', (_pattern, _channel, message) => {
    try {
      const event = JSON.parse(message) as DomainEvent;
      io.to(targetRoom(event)).emit('domain-event', event);
    } catch {
      // Malformed payloads are dropped rather than crashing the bridge.
    }
  });

  return subscriber;
}
