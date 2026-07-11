import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { emitDomainEvent } from '../../lib/events.js';
import { enqueueIndex } from '../../lib/search-index.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.js';

export const orgsRouter = Router();
orgsRouter.use(requireAuth);

const createOrgSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/),
});

orgsRouter.post('/', async (req: AuthedRequest, res) => {
  const parsed = createOrgSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const org = await prisma.organization.create({
    data: {
      name: parsed.data.name,
      slug: parsed.data.slug,
      members: {
        create: { userId: req.userId as string, role: 'OWNER' },
      },
    },
    include: { members: true },
  });

  await emitDomainEvent({
    type: 'organization.created',
    organizationId: org.id,
    actorId: req.userId as string,
    targetType: 'organization',
    targetId: org.id,
    payload: { name: org.name, slug: org.slug },
  });

  const owner = await prisma.user.findUnique({ where: { id: req.userId } });
  if (owner) {
    await enqueueIndex({
      entityType: 'person',
      action: 'upsert',
      id: owner.id,
      organizationId: org.id,
      workspaceId: null,
      resourceType: 'ORGANIZATION',
      resourceId: org.id,
      fields: { displayName: owner.displayName, email: owner.email },
    });
  }

  res.status(201).json(org);
});

orgsRouter.get('/', async (req: AuthedRequest, res) => {
  const orgs = await prisma.organization.findMany({
    where: { members: { some: { userId: req.userId } } },
    include: { members: true },
  });
  res.json(orgs);
});

async function requireOrgRole(
  organizationId: string,
  userId: string,
  allowed: Array<'OWNER' | 'ADMIN' | 'MEMBER' | 'GUEST'>,
) {
  const membership = await prisma.orgMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
  });
  if (!membership || !allowed.includes(membership.role)) {
    return null;
  }
  return membership;
}

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['ADMIN', 'MEMBER', 'GUEST']).default('MEMBER'),
});

orgsRouter.post('/:orgId/invitations', async (req: AuthedRequest, res) => {
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const membership = await requireOrgRole(req.params.orgId, req.userId as string, ['OWNER', 'ADMIN']);
  if (!membership) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const { randomBytes, createHash } = await import('node:crypto');
  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');

  const invitation = await prisma.invitation.create({
    data: {
      organizationId: req.params.orgId,
      email: parsed.data.email,
      role: parsed.data.role,
      invitedById: req.userId as string,
      tokenHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  await emitDomainEvent({
    type: 'invitation.created',
    organizationId: req.params.orgId,
    actorId: req.userId as string,
    targetType: 'invitation',
    targetId: invitation.id,
    payload: { email: invitation.email, role: invitation.role },
  });

  // TODO(Phase 8): enqueue invitation email job on the worker instead of inline send.
  res.status(201).json({ invitationId: invitation.id, token: rawToken });
});

const acceptInvitationSchema = z.object({ token: z.string().min(1) });

orgsRouter.post('/invitations/accept', async (req: AuthedRequest, res) => {
  const parsed = acceptInvitationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { createHash } = await import('node:crypto');
  const tokenHash = createHash('sha256').update(parsed.data.token).digest('hex');

  const invitation = await prisma.invitation.findUnique({ where: { tokenHash } });
  if (!invitation || invitation.status !== 'PENDING' || invitation.expiresAt < new Date()) {
    res.status(400).json({ error: 'Invalid or expired invitation' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user || user.email !== invitation.email) {
    res.status(403).json({ error: 'Invitation was issued to a different email address' });
    return;
  }

  const [membership] = await prisma.$transaction([
    prisma.orgMember.upsert({
      where: { organizationId_userId: { organizationId: invitation.organizationId, userId: user.id } },
      create: { organizationId: invitation.organizationId, userId: user.id, role: invitation.role },
      update: {},
    }),
    prisma.invitation.update({ where: { id: invitation.id }, data: { status: 'ACCEPTED' } }),
  ]);

  await emitDomainEvent({
    type: 'invitation.accepted',
    organizationId: invitation.organizationId,
    actorId: user.id,
    targetType: 'invitation',
    targetId: invitation.id,
    payload: { role: membership.role },
  });

  await enqueueIndex({
    entityType: 'person',
    action: 'upsert',
    id: user.id,
    organizationId: invitation.organizationId,
    workspaceId: null,
    resourceType: 'ORGANIZATION',
    resourceId: invitation.organizationId,
    fields: { displayName: user.displayName, email: user.email },
  });

  res.json(membership);
});
