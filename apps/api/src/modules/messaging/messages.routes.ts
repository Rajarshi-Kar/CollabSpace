import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { emitDomainEvent } from '../../lib/events.js';
import { enqueueIndex } from '../../lib/search-index.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.js';
import { canViewChannel, isChannelMember } from './channels.routes.js';

export const messagesRouter = Router({ mergeParams: true });
messagesRouter.use(requireAuth);

async function getChannelScope(channelId: string): Promise<{ organizationId: string; workspaceId: string } | null> {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { workspaceId: true, workspace: { select: { organizationId: true } } },
  });
  return channel ? { organizationId: channel.workspace.organizationId, workspaceId: channel.workspaceId } : null;
}

function extractMentions(body: string): string[] {
  // Mentions are written as @<userId> by the client (resolved from an
  // autocomplete), not @displayName, so this stays a cheap regex instead of
  // needing a name-resolution lookup on every message.
  const matches = body.matchAll(/@([0-9a-fA-F-]{36})/g);
  return Array.from(new Set(Array.from(matches, (m) => m[1])));
}

const sendMessageSchema = z.object({
  body: z.string().min(1).max(8000),
  parentId: z.string().uuid().optional(),
});

messagesRouter.post('/', async (req: AuthedRequest, res) => {
  const parsed = sendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  if (!(await isChannelMember(req.params.channelId, req.userId as string))) {
    // Auto-join on first message to a public channel, mirroring the
    // implicit-membership read model in canViewChannel.
    const channel = await prisma.channel.findUnique({ where: { id: req.params.channelId } });
    if (!channel || channel.isPrivate || channel.isDirect) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    await prisma.channelMember.create({
      data: { channelId: req.params.channelId, userId: req.userId as string },
    });
  }

  const scope = await getChannelScope(req.params.channelId);
  if (!scope) {
    res.status(404).json({ error: 'Channel not found' });
    return;
  }

  const message = await prisma.message.create({
    data: {
      channelId: req.params.channelId,
      authorId: req.userId as string,
      body: parsed.data.body,
      parentId: parsed.data.parentId,
      mentionedUserIds: extractMentions(parsed.data.body),
    },
  });

  await emitDomainEvent({
    type: 'message.sent',
    organizationId: scope.organizationId,
    actorId: req.userId as string,
    targetType: 'message',
    targetId: message.id,
    payload: { channelId: message.channelId, parentId: message.parentId },
  });

  await enqueueIndex({
    entityType: 'message',
    action: 'upsert',
    id: message.id,
    organizationId: scope.organizationId,
    workspaceId: scope.workspaceId,
    resourceType: 'CHANNEL',
    resourceId: message.channelId,
    fields: { body: message.body, channelId: message.channelId, createdAt: message.createdAt },
  });

  res.status(201).json(message);
});

const listMessagesQuerySchema = z.object({
  // Cursor pagination: `before` is a message id, results are the page of
  // messages immediately preceding it, newest-first. Avoids the
  // page-drift you get from offset pagination on a fast-growing table.
  before: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  parentId: z.string().uuid().optional(),
});

messagesRouter.get('/', async (req: AuthedRequest, res) => {
  if (!(await canViewChannel(req.params.channelId, req.userId as string))) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const query = listMessagesQuerySchema.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.flatten() });
    return;
  }

  const cursor = query.data.before
    ? await prisma.message.findUnique({ where: { id: query.data.before }, select: { createdAt: true } })
    : null;

  const messages = await prisma.message.findMany({
    where: {
      channelId: req.params.channelId,
      deletedAt: null,
      parentId: query.data.parentId ?? null,
      createdAt: cursor ? { lt: cursor.createdAt } : undefined,
    },
    include: { reactions: true, _count: { select: { replies: true } } },
    orderBy: { createdAt: 'desc' },
    take: query.data.limit,
  });

  res.json(messages);
});

const editMessageSchema = z.object({ body: z.string().min(1).max(8000) });

messagesRouter.patch('/:messageId', async (req: AuthedRequest, res) => {
  const parsed = editMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const message = await prisma.message.findUnique({ where: { id: req.params.messageId } });
  if (!message || message.authorId !== req.userId) {
    res.status(403).json({ error: 'Only the author can edit this message' });
    return;
  }
  const updated = await prisma.message.update({
    where: { id: message.id },
    data: { body: parsed.data.body, editedAt: new Date(), mentionedUserIds: extractMentions(parsed.data.body) },
  });
  res.json(updated);
});

messagesRouter.delete('/:messageId', async (req: AuthedRequest, res) => {
  const message = await prisma.message.findUnique({ where: { id: req.params.messageId } });
  if (!message || message.authorId !== req.userId) {
    res.status(403).json({ error: 'Only the author can delete this message' });
    return;
  }
  await prisma.message.update({ where: { id: message.id }, data: { deletedAt: new Date(), body: '' } });

  const scope = await getChannelScope(req.params.channelId);
  if (scope) {
    await enqueueIndex({
      entityType: 'message',
      action: 'delete',
      id: message.id,
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      resourceType: 'CHANNEL',
      resourceId: message.channelId,
      fields: {},
    });
  }

  res.status(204).end();
});

messagesRouter.post('/:messageId/pin', async (req: AuthedRequest, res) => {
  if (!(await isChannelMember(req.params.channelId, req.userId as string))) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const message = await prisma.message.update({
    where: { id: req.params.messageId },
    data: { pinnedAt: new Date() },
  });
  res.json(message);
});

messagesRouter.delete('/:messageId/pin', async (req: AuthedRequest, res) => {
  if (!(await isChannelMember(req.params.channelId, req.userId as string))) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const message = await prisma.message.update({
    where: { id: req.params.messageId },
    data: { pinnedAt: null },
  });
  res.json(message);
});

const reactSchema = z.object({ emoji: z.string().min(1).max(8) });

messagesRouter.post('/:messageId/reactions', async (req: AuthedRequest, res) => {
  const parsed = reactSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  if (!(await isChannelMember(req.params.channelId, req.userId as string))) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const reaction = await prisma.messageReaction.upsert({
    where: {
      messageId_userId_emoji: {
        messageId: req.params.messageId,
        userId: req.userId as string,
        emoji: parsed.data.emoji,
      },
    },
    create: { messageId: req.params.messageId, userId: req.userId as string, emoji: parsed.data.emoji },
    update: {},
  });
  res.status(201).json(reaction);
});

messagesRouter.delete('/:messageId/reactions/:emoji', async (req: AuthedRequest, res) => {
  await prisma.messageReaction.deleteMany({
    where: { messageId: req.params.messageId, userId: req.userId as string, emoji: req.params.emoji },
  });
  res.status(204).end();
});

const markReadSchema = z.object({ at: z.string().datetime().optional() });

messagesRouter.post('/read', async (req: AuthedRequest, res) => {
  const parsed = markReadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const membership = await prisma.channelMember.update({
    where: { channelId_userId: { channelId: req.params.channelId, userId: req.userId as string } },
    data: { lastReadAt: parsed.data.at ? new Date(parsed.data.at) : new Date() },
  });
  res.json(membership);
});
