import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { emitDomainEvent } from '../../lib/events.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.js';

export const workspacesRouter = Router({ mergeParams: true });
workspacesRouter.use(requireAuth);

async function requireOrgMember(organizationId: string, userId: string) {
  return prisma.orgMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
  });
}

const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/),
});

workspacesRouter.post('/', async (req: AuthedRequest, res) => {
  const parsed = createWorkspaceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const membership = await requireOrgMember(req.params.orgId, req.userId as string);
  if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const workspace = await prisma.workspace.create({
    data: { organizationId: req.params.orgId, name: parsed.data.name, slug: parsed.data.slug },
  });

  await emitDomainEvent({
    type: 'workspace.created',
    organizationId: req.params.orgId,
    actorId: req.userId as string,
    targetType: 'workspace',
    targetId: workspace.id,
    payload: { name: workspace.name, slug: workspace.slug },
  });

  res.status(201).json(workspace);
});

workspacesRouter.get('/', async (req: AuthedRequest, res) => {
  const membership = await requireOrgMember(req.params.orgId, req.userId as string);
  if (!membership) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const workspaces = await prisma.workspace.findMany({
    where: { organizationId: req.params.orgId },
    orderBy: { createdAt: 'asc' },
  });
  res.json(workspaces);
});
