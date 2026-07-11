import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.js';

export const activityRouter = Router({ mergeParams: true });
activityRouter.use(requireAuth);

const listQuerySchema = z.object({
  targetType: z.string().optional(),
  before: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// Activity feed reads straight off the audit log rather than a separate
// model — every mutation already writes one row there via emitDomainEvent,
// so this is a filtered view, not a second source of truth. Audit rows are
// organization-scoped (not per-workspace), so this is an org-wide feed;
// narrowing to one workspace/project would need a join through targetId per
// targetType, which isn't worth the complexity yet.
activityRouter.get('/', async (req: AuthedRequest, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const membership = await prisma.orgMember.findUnique({
    where: { organizationId_userId: { organizationId: req.params.orgId, userId: req.userId as string } },
  });
  if (!membership) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const cursor = parsed.data.before
    ? await prisma.auditLog.findUnique({ where: { id: parsed.data.before }, select: { createdAt: true } })
    : null;

  const entries = await prisma.auditLog.findMany({
    where: {
      organizationId: req.params.orgId,
      targetType: parsed.data.targetType,
      createdAt: cursor ? { lt: cursor.createdAt } : undefined,
    },
    include: { actor: { select: { id: true, displayName: true, avatarUrl: true } } },
    orderBy: { createdAt: 'desc' },
    take: parsed.data.limit,
  });

  res.json(entries);
});
