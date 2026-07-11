import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.js';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

const listQuerySchema = z.object({
  unreadOnly: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

notificationsRouter.get('/', async (req: AuthedRequest, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const notifications = await prisma.notification.findMany({
    where: { userId: req.userId, readAt: parsed.data.unreadOnly ? null : undefined },
    orderBy: { createdAt: 'desc' },
    take: parsed.data.limit,
  });
  const unreadCount = await prisma.notification.count({ where: { userId: req.userId, readAt: null } });
  res.json({ notifications, unreadCount });
});

notificationsRouter.post('/:notificationId/read', async (req: AuthedRequest, res) => {
  const notification = await prisma.notification.updateMany({
    where: { id: req.params.notificationId, userId: req.userId },
    data: { readAt: new Date() },
  });
  if (notification.count === 0) {
    res.status(404).json({ error: 'Notification not found' });
    return;
  }
  res.status(204).end();
});

notificationsRouter.post('/read-all', async (req: AuthedRequest, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.userId, readAt: null },
    data: { readAt: new Date() },
  });
  res.status(204).end();
});

const preferencesSchema = z.object({
  mutedTypes: z.array(z.enum(['MENTION', 'COMMENT', 'TASK_ASSIGNED', 'TASK_DUE_REMINDER', 'INVITATION'])).optional(),
  emailDigest: z.boolean().optional(),
  emailImmediate: z.boolean().optional(),
});

notificationsRouter.get('/preferences', async (req: AuthedRequest, res) => {
  const preference = await prisma.notificationPreference.upsert({
    where: { userId: req.userId as string },
    create: { userId: req.userId as string },
    update: {},
  });
  res.json(preference);
});

notificationsRouter.put('/preferences', async (req: AuthedRequest, res) => {
  const parsed = preferencesSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const preference = await prisma.notificationPreference.upsert({
    where: { userId: req.userId as string },
    create: { userId: req.userId as string, ...parsed.data },
    update: parsed.data,
  });
  res.json(preference);
});
