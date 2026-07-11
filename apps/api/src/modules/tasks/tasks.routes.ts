import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { emitDomainEvent } from '../../lib/events.js';
import { enqueueIndex } from '../../lib/search-index.js';
import { notify } from '../../lib/notify.js';
import { scheduleTaskReminder } from '../../lib/reminders.js';
import { rankBetween } from '../../lib/rank.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.js';
import { requireProjectLevel } from '../projects/projects.routes.js';
import type { Task } from '@prisma/client';

export const tasksRouter = Router({ mergeParams: true });
tasksRouter.use(requireAuth);

function indexTask(task: Task, organizationId: string, workspaceId: string) {
  return enqueueIndex({
    entityType: 'task',
    action: 'upsert',
    id: task.id,
    organizationId,
    workspaceId,
    resourceType: 'PROJECT',
    resourceId: task.projectId,
    fields: { title: task.title, description: task.description, status: task.status, priority: task.priority },
  });
}

const createTaskSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(10_000).optional(),
  status: z.enum(['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']).default('BACKLOG'),
  priority: z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('NONE'),
  assigneeId: z.string().uuid().optional(),
  milestoneId: z.string().uuid().optional(),
  sprintId: z.string().uuid().optional(),
  documentId: z.string().uuid().optional(),
  dueDate: z.string().datetime().optional(),
});

tasksRouter.post('/', async (req: AuthedRequest, res) => {
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const organizationId = await requireProjectLevel(req, req.params.workspaceId, req.params.projectId, 'EDIT');
  if (!organizationId) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  // Sequential per-project numbering (ENG-1, ENG-2, ...) and board rank are
  // both derived from current project state, so compute them in the same
  // transaction that inserts the row to keep the read-then-write atomic.
  const task = await prisma.$transaction(async (tx) => {
    const last = await tx.task.findFirst({
      where: { projectId: req.params.projectId },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    const topOfColumn = await tx.task.findFirst({
      where: { projectId: req.params.projectId, status: parsed.data.status },
      orderBy: { boardRank: 'asc' },
      select: { boardRank: true },
    });

    return tx.task.create({
      data: {
        projectId: req.params.projectId,
        number: (last?.number ?? 0) + 1,
        title: parsed.data.title,
        description: parsed.data.description,
        status: parsed.data.status,
        priority: parsed.data.priority,
        assigneeId: parsed.data.assigneeId,
        milestoneId: parsed.data.milestoneId,
        sprintId: parsed.data.sprintId,
        documentId: parsed.data.documentId,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
        boardRank: rankBetween(null, topOfColumn?.boardRank ?? null),
        createdById: req.userId as string,
      },
    });
  });

  await emitDomainEvent({
    type: 'task.created',
    organizationId,
    actorId: req.userId as string,
    targetType: 'task',
    targetId: task.id,
    payload: { title: task.title, status: task.status, projectId: task.projectId },
  });
  await indexTask(task, organizationId, req.params.workspaceId);
  await scheduleTaskReminder(task.id, task.dueDate);

  if (task.assigneeId && task.assigneeId !== req.userId) {
    await notify({
      userId: task.assigneeId,
      organizationId,
      type: 'TASK_ASSIGNED',
      payload: { taskId: task.id, projectId: task.projectId, title: task.title },
    });
  }

  res.status(201).json(task);
});

const listTasksQuerySchema = z.object({
  status: z.enum(['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']).optional(),
  assigneeId: z.string().uuid().optional(),
  sprintId: z.string().uuid().optional(),
  milestoneId: z.string().uuid().optional(),
});

tasksRouter.get('/', async (req: AuthedRequest, res) => {
  if (!(await requireProjectLevel(req, req.params.workspaceId, req.params.projectId, 'VIEW'))) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const query = listTasksQuerySchema.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.flatten() });
    return;
  }

  const tasks = await prisma.task.findMany({
    where: {
      projectId: req.params.projectId,
      status: query.data.status,
      assigneeId: query.data.assigneeId,
      sprintId: query.data.sprintId,
      milestoneId: query.data.milestoneId,
    },
    include: { labels: { include: { label: true } } },
    orderBy: [{ status: 'asc' }, { boardRank: 'asc' }],
  });
  res.json(tasks);
});

tasksRouter.get('/:taskId', async (req: AuthedRequest, res) => {
  if (!(await requireProjectLevel(req, req.params.workspaceId, req.params.projectId, 'VIEW'))) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const task = await prisma.task.findFirst({
    where: { id: req.params.taskId, projectId: req.params.projectId },
    include: {
      labels: { include: { label: true } },
      dependsOn: { include: { dependsOn: { select: { id: true, title: true, status: true } } } },
      blocks: { include: { dependent: { select: { id: true, title: true, status: true } } } },
    },
  });
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  res.json(task);
});

const updateTaskSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(10_000).nullable().optional(),
  priority: z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  milestoneId: z.string().uuid().nullable().optional(),
  sprintId: z.string().uuid().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
});

tasksRouter.patch('/:taskId', async (req: AuthedRequest, res) => {
  const parsed = updateTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const organizationId = await requireProjectLevel(req, req.params.workspaceId, req.params.projectId, 'EDIT');
  if (!organizationId) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const previous = await prisma.task.findUnique({
    where: { id: req.params.taskId },
    select: { assigneeId: true },
  });

  const task = await prisma.task.update({
    where: { id: req.params.taskId },
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      priority: parsed.data.priority,
      assigneeId: parsed.data.assigneeId,
      milestoneId: parsed.data.milestoneId,
      sprintId: parsed.data.sprintId,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : parsed.data.dueDate,
    },
  });

  await emitDomainEvent({
    type: 'task.updated',
    organizationId,
    actorId: req.userId as string,
    targetType: 'task',
    targetId: task.id,
    payload: { projectId: task.projectId },
  });
  await indexTask(task, organizationId, req.params.workspaceId);

  if (parsed.data.dueDate !== undefined) {
    await scheduleTaskReminder(task.id, task.dueDate);
  }

  if (
    parsed.data.assigneeId !== undefined &&
    task.assigneeId &&
    task.assigneeId !== previous?.assigneeId &&
    task.assigneeId !== req.userId
  ) {
    await notify({
      userId: task.assigneeId,
      organizationId,
      type: 'TASK_ASSIGNED',
      payload: { taskId: task.id, projectId: task.projectId, title: task.title },
    });
  }

  res.json(task);
});

const moveTaskSchema = z.object({
  status: z.enum(['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']),
  // IDs of the tasks that should end up immediately before/after this one in
  // the target column, so the server can compute a rank between them without
  // the client needing to know the ranking scheme.
  beforeTaskId: z.string().uuid().optional(),
  afterTaskId: z.string().uuid().optional(),
});

// Kanban drag-and-drop: reorders within or across columns via fractional
// ranks so only the moved row is written, not the whole column.
tasksRouter.post('/:taskId/move', async (req: AuthedRequest, res) => {
  const parsed = moveTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const organizationId = await requireProjectLevel(req, req.params.workspaceId, req.params.projectId, 'EDIT');
  if (!organizationId) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const [before, after] = await Promise.all([
    parsed.data.beforeTaskId
      ? prisma.task.findUnique({ where: { id: parsed.data.beforeTaskId }, select: { boardRank: true } })
      : null,
    parsed.data.afterTaskId
      ? prisma.task.findUnique({ where: { id: parsed.data.afterTaskId }, select: { boardRank: true } })
      : null,
  ]);

  const boardRank = rankBetween(before?.boardRank ?? null, after?.boardRank ?? null);

  const task = await prisma.task.update({
    where: { id: req.params.taskId },
    data: { status: parsed.data.status, boardRank },
  });

  await emitDomainEvent({
    type: 'task.updated',
    organizationId,
    actorId: req.userId as string,
    targetType: 'task',
    targetId: task.id,
    payload: { projectId: task.projectId, action: 'moved', status: task.status },
  });
  await indexTask(task, organizationId, req.params.workspaceId);

  res.json(task);
});

tasksRouter.post('/:taskId/labels/:labelId', async (req: AuthedRequest, res) => {
  if (!(await requireProjectLevel(req, req.params.workspaceId, req.params.projectId, 'EDIT'))) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  await prisma.taskLabel.upsert({
    where: { taskId_labelId: { taskId: req.params.taskId, labelId: req.params.labelId } },
    create: { taskId: req.params.taskId, labelId: req.params.labelId },
    update: {},
  });
  res.status(204).end();
});

tasksRouter.delete('/:taskId/labels/:labelId', async (req: AuthedRequest, res) => {
  if (!(await requireProjectLevel(req, req.params.workspaceId, req.params.projectId, 'EDIT'))) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  await prisma.taskLabel.deleteMany({ where: { taskId: req.params.taskId, labelId: req.params.labelId } });
  res.status(204).end();
});

const dependencySchema = z.object({ dependsOnId: z.string().uuid() });

tasksRouter.post('/:taskId/dependencies', async (req: AuthedRequest, res) => {
  const parsed = dependencySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  if (!(await requireProjectLevel(req, req.params.workspaceId, req.params.projectId, 'EDIT'))) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  if (parsed.data.dependsOnId === req.params.taskId) {
    res.status(400).json({ error: 'A task cannot depend on itself' });
    return;
  }

  const dependency = await prisma.taskDependency.upsert({
    where: {
      dependentId_dependsOnId: { dependentId: req.params.taskId, dependsOnId: parsed.data.dependsOnId },
    },
    create: { dependentId: req.params.taskId, dependsOnId: parsed.data.dependsOnId },
    update: {},
  });
  res.status(201).json(dependency);
});

tasksRouter.delete('/:taskId/dependencies/:dependsOnId', async (req: AuthedRequest, res) => {
  if (!(await requireProjectLevel(req, req.params.workspaceId, req.params.projectId, 'EDIT'))) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  await prisma.taskDependency.deleteMany({
    where: { dependentId: req.params.taskId, dependsOnId: req.params.dependsOnId },
  });
  res.status(204).end();
});
