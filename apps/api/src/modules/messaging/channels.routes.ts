import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { emitDomainEvent } from '../../lib/events.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.js';
import { levelAtLeast, resolvePermission } from '../permissions/permissions.service.js';

export const channelsRouter = Router({ mergeParams: true });
channelsRouter.use(requireAuth);

async function getWorkspaceOrg(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  return workspace?.organizationId ?? null;
}

// Channel access is membership-gated like a chat app, not ACL-graded like a
// document: being a ChannelMember (or the channel being non-private, in
// which case any workspace member can join implicitly) is what grants read
// access. MANAGE-level actions (rename/archive) still go through the
// permission-resolution service so workspace admins retain override rights.
export async function isChannelMember(channelId: string, userId: string): Promise<boolean> {
  const membership = await prisma.channelMember.findUnique({
    where: { channelId_userId: { channelId, userId } },
  });
  return membership !== null;
}

export async function canViewChannel(channelId: string, userId: string): Promise<boolean> {
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) return false;
  if (await isChannelMember(channelId, userId)) return true;
  if (channel.isPrivate || channel.isDirect) return false;

  const orgMembership = await prisma.orgMember.findFirst({
    where: { organizationId: (await getWorkspaceOrg(channel.workspaceId)) ?? '', userId },
  });
  return orgMembership !== null;
}

const createChannelSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/),
  isPrivate: z.boolean().default(false),
});

channelsRouter.post('/', async (req: AuthedRequest, res) => {
  const parsed = createChannelSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const organizationId = await getWorkspaceOrg(req.params.workspaceId);
  if (!organizationId) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }
  const membership = await prisma.orgMember.findUnique({
    where: { organizationId_userId: { organizationId, userId: req.userId as string } },
  });
  if (!membership) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const channel = await prisma.channel.create({
    data: {
      workspaceId: req.params.workspaceId,
      name: parsed.data.name,
      isPrivate: parsed.data.isPrivate,
      createdById: req.userId as string,
      members: { create: { userId: req.userId as string } },
    },
  });

  await emitDomainEvent({
    type: 'channel.created',
    organizationId,
    actorId: req.userId as string,
    targetType: 'channel',
    targetId: channel.id,
    payload: { name: channel.name },
  });

  res.status(201).json(channel);
});

channelsRouter.get('/', async (req: AuthedRequest, res) => {
  const organizationId = await getWorkspaceOrg(req.params.workspaceId);
  if (!organizationId) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }
  const membership = await prisma.orgMember.findUnique({
    where: { organizationId_userId: { organizationId, userId: req.userId as string } },
  });
  if (!membership) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const channels = await prisma.channel.findMany({
    where: {
      workspaceId: req.params.workspaceId,
      isDirect: false,
      OR: [{ isPrivate: false }, { members: { some: { userId: req.userId as string } } }],
    },
    orderBy: { createdAt: 'asc' },
  });
  res.json(channels);
});

channelsRouter.post('/:channelId/join', async (req: AuthedRequest, res) => {
  const channel = await prisma.channel.findFirst({
    where: { id: req.params.channelId, workspaceId: req.params.workspaceId },
  });
  if (!channel || channel.isPrivate || channel.isDirect) {
    res.status(403).json({ error: 'Cannot join this channel directly' });
    return;
  }
  const membership = await prisma.channelMember.upsert({
    where: { channelId_userId: { channelId: channel.id, userId: req.userId as string } },
    create: { channelId: channel.id, userId: req.userId as string },
    update: {},
  });
  res.status(201).json(membership);
});

channelsRouter.post('/:channelId/leave', async (req: AuthedRequest, res) => {
  await prisma.channelMember.deleteMany({
    where: { channelId: req.params.channelId, userId: req.userId as string },
  });
  res.status(204).end();
});

channelsRouter.delete('/:channelId', async (req: AuthedRequest, res) => {
  const organizationId = await getWorkspaceOrg(req.params.workspaceId);
  if (!organizationId) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }
  const level = await resolvePermission({
    userId: req.userId as string,
    organizationId,
    workspaceId: req.params.workspaceId,
    resourceType: 'CHANNEL',
    resourceId: req.params.channelId,
  });
  if (!level || !levelAtLeast(level, 'MANAGE')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  await prisma.channel.delete({ where: { id: req.params.channelId } });
  res.status(204).end();
});

const createDmSchema = z.object({ userId: z.string().uuid() });

// Direct messages are modeled as a two-member private Channel with
// isDirect=true so all messaging machinery (threads, reactions, read
// receipts) works identically for DMs and channels.
channelsRouter.post('/dm', async (req: AuthedRequest, res) => {
  const parsed = createDmSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const organizationId = await getWorkspaceOrg(req.params.workspaceId);
  if (!organizationId) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }

  const selfId = req.userId as string;
  const otherId = parsed.data.userId;

  const existing = await prisma.channel.findFirst({
    where: {
      workspaceId: req.params.workspaceId,
      isDirect: true,
      AND: [
        { members: { some: { userId: selfId } } },
        { members: { some: { userId: otherId } } },
      ],
    },
  });
  if (existing) {
    res.json(existing);
    return;
  }

  const channel = await prisma.channel.create({
    data: {
      workspaceId: req.params.workspaceId,
      isDirect: true,
      isPrivate: true,
      createdById: selfId,
      members: { create: [{ userId: selfId }, { userId: otherId }] },
    },
  });
  res.status(201).json(channel);
});
