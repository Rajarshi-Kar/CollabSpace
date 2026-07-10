import { prisma } from './prisma.js';
import { redis } from './redis.js';
import type { DomainEvent, DomainEventType } from '@collabspace/shared';

/**
 * Single entry point for domain mutations: writes the audit-log row and
 * publishes to Redis so realtime sockets, search indexing, and notification
 * fan-out (Phase 2+) can all derive from one event instead of duplicating
 * side effects at each call site.
 */
export async function emitDomainEvent<T>(event: {
  type: DomainEventType;
  organizationId: string;
  actorId: string;
  targetType: string;
  targetId: string;
  payload: T;
}) {
  await prisma.auditLog.create({
    data: {
      organizationId: event.organizationId,
      actorId: event.actorId,
      action: event.type,
      targetType: event.targetType,
      targetId: event.targetId,
      metadata: event.payload as never,
    },
  });

  const domainEvent: DomainEvent<T> = {
    type: event.type,
    organizationId: event.organizationId,
    actorId: event.actorId,
    payload: event.payload,
    occurredAt: new Date().toISOString(),
  };

  await redis.publish(`org:${event.organizationId}:events`, JSON.stringify(domainEvent));
}
