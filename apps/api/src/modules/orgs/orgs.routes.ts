import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
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

  await prisma.auditLog.create({
    data: {
      organizationId: org.id,
      actorId: req.userId,
      action: 'organization.created',
      targetType: 'organization',
      targetId: org.id,
    },
  });

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

  // TODO(Phase 8): enqueue invitation email job on the worker instead of inline send.
  res.status(201).json({ invitationId: invitation.id, token: rawToken });
});
