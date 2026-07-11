import type { NotificationType } from '@prisma/client';
import { prisma } from './prisma.js';
import { redis } from './redis.js';
import { emailQueue } from './queues.js';

export interface NotifyParams {
  userId: string;
  organizationId: string;
  type: NotificationType;
  payload: Record<string, unknown>;
}

/**
 * Creates a notification, pushes it to the recipient's private socket room
 * over Redis pub/sub (see realtime/notificationBridge.ts), and enqueues an
 * immediate email if the recipient opted into that instead of the digest.
 * Digest emails are assembled separately by a scheduled job (Phase 9), not
 * here, since bundling requires looking at everything unsent since the last
 * digest rather than one notification at a time.
 */
export async function notify({ userId, organizationId, type, payload }: NotifyParams) {
  const preference = await prisma.notificationPreference.findUnique({ where: { userId } });
  if (preference?.mutedTypes.includes(type)) return;

  const notification = await prisma.notification.create({
    data: { userId, organizationId, type, payload: payload as never },
  });

  await redis.publish(`user:${userId}:notifications`, JSON.stringify(notification));

  if (preference?.emailImmediate) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (user) {
      const template = type === 'TASK_DUE_REMINDER' ? 'task-reminder' : type === 'INVITATION' ? 'invitation' : 'mention';
      await emailQueue.add('send', { to: user.email, template, data: { type, payload } });
    }
  }

  return notification;
}
