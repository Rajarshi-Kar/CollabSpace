import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.js';

export const analyticsRouter = Router({ mergeParams: true });
analyticsRouter.use(requireAuth);

async function requireWorkspaceMember(workspaceId: string, userId: string) {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) return null;
  const membership = await prisma.orgMember.findUnique({
    where: { organizationId_userId: { organizationId: workspace.organizationId, userId } },
  });
  return membership ? workspace : null;
}

const rangeQuerySchema = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

// Aggregates are computed on read rather than maintained as running
// counters — this is a demo-scale project, and read-time aggregation avoids
// an entire class of counter-drift bugs at the cost of query time that's
// still fine at this data volume.
analyticsRouter.get('/', async (req: AuthedRequest, res) => {
  const workspace = await requireWorkspaceMember(req.params.workspaceId, req.userId as string);
  if (!workspace) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const parsed = rangeQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const since = new Date(Date.now() - parsed.data.days * 24 * 60 * 60 * 1000);

  const [projects, storageUsage, activeActors, documentCount, channelCount] = await Promise.all([
    prisma.project.findMany({
      where: { workspaceId: req.params.workspaceId, archivedAt: null },
      select: {
        id: true,
        name: true,
        key: true,
        tasks: { select: { status: true, dueDate: true } },
      },
    }),
    prisma.fileVersion.aggregate({
      where: { currentFor: { workspaceId: req.params.workspaceId } },
      _sum: { sizeBytes: true },
    }),
    prisma.auditLog.findMany({
      where: { organizationId: workspace.organizationId, createdAt: { gte: since }, actorId: { not: null } },
      select: { actorId: true },
      distinct: ['actorId'],
    }),
    prisma.document.count({ where: { workspaceId: req.params.workspaceId, archivedAt: null } }),
    prisma.channel.count({ where: { workspaceId: req.params.workspaceId, isDirect: false } }),
  ]);

  const now = new Date();
  const projectProgress = projects.map((project) => {
    const total = project.tasks.length;
    const done = project.tasks.filter((t) => t.status === 'DONE').length;
    const overdue = project.tasks.filter((t) => t.dueDate && t.dueDate < now && t.status !== 'DONE').length;
    return {
      projectId: project.id,
      name: project.name,
      key: project.key,
      totalTasks: total,
      doneTasks: done,
      overdueTasks: overdue,
      completionRate: total > 0 ? done / total : 0,
    };
  });

  const totalTasks = projectProgress.reduce((sum, p) => sum + p.totalTasks, 0);
  const totalDone = projectProgress.reduce((sum, p) => sum + p.doneTasks, 0);

  res.json({
    workspaceId: req.params.workspaceId,
    rangeDays: parsed.data.days,
    projectProgress,
    taskCompletion: {
      total: totalTasks,
      done: totalDone,
      rate: totalTasks > 0 ? totalDone / totalTasks : 0,
    },
    engagement: { activeUsers: activeActors.length },
    storage: { usedBytes: (storageUsage._sum.sizeBytes ?? 0n).toString() },
    counts: { documents: documentCount, channels: channelCount, projects: projects.length },
  });
});
