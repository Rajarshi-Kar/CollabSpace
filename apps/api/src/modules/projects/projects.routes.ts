import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { emitDomainEvent } from '../../lib/events.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.js';
import { levelAtLeast, resolvePermission } from '../permissions/permissions.service.js';

export const projectsRouter = Router({ mergeParams: true });
projectsRouter.use(requireAuth);

async function getWorkspaceOrg(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  return workspace?.organizationId ?? null;
}

export async function requireProjectLevel(
  req: AuthedRequest,
  workspaceId: string,
  projectId: string,
  required: 'VIEW' | 'COMMENT' | 'EDIT' | 'MANAGE',
): Promise<string | null> {
  const organizationId = await getWorkspaceOrg(workspaceId);
  if (!organizationId) return null;
  const level = await resolvePermission({
    userId: req.userId as string,
    organizationId,
    workspaceId,
    resourceType: 'PROJECT',
    resourceId: projectId,
  });
  if (!level || !levelAtLeast(level, required)) return null;
  return organizationId;
}

const createProjectSchema = z.object({
  name: z.string().min(1).max(120),
  key: z
    .string()
    .min(2)
    .max(10)
    .regex(/^[A-Z0-9]+$/),
  description: z.string().max(2000).optional(),
});

projectsRouter.post('/', async (req: AuthedRequest, res) => {
  const parsed = createProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const organizationId = await getWorkspaceOrg(req.params.workspaceId);
  if (!organizationId) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }
  const level = await resolvePermission({
    userId: req.userId as string,
    organizationId,
    workspaceId: req.params.workspaceId,
    resourceType: 'WORKSPACE',
    resourceId: req.params.workspaceId,
  });
  if (!level || !levelAtLeast(level, 'EDIT')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const project = await prisma.project.create({
    data: {
      workspaceId: req.params.workspaceId,
      name: parsed.data.name,
      key: parsed.data.key,
      description: parsed.data.description,
      createdById: req.userId as string,
    },
  });

  await emitDomainEvent({
    type: 'project.created',
    organizationId,
    actorId: req.userId as string,
    targetType: 'project',
    targetId: project.id,
    payload: { name: project.name, key: project.key },
  });

  res.status(201).json(project);
});

projectsRouter.get('/', async (req: AuthedRequest, res) => {
  const organizationId = await getWorkspaceOrg(req.params.workspaceId);
  if (!organizationId) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }
  const level = await resolvePermission({
    userId: req.userId as string,
    organizationId,
    workspaceId: req.params.workspaceId,
    resourceType: 'WORKSPACE',
    resourceId: req.params.workspaceId,
  });
  if (!level) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const projects = await prisma.project.findMany({
    where: { workspaceId: req.params.workspaceId, archivedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  res.json(projects);
});

projectsRouter.get('/:projectId', async (req: AuthedRequest, res) => {
  if (!(await requireProjectLevel(req, req.params.workspaceId, req.params.projectId, 'VIEW'))) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const project = await prisma.project.findFirst({
    where: { id: req.params.projectId, workspaceId: req.params.workspaceId },
    include: { labels: true, milestones: true, sprints: true },
  });
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.json(project);
});

const createLabelSchema = z.object({
  name: z.string().min(1).max(40),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/),
});

projectsRouter.post('/:projectId/labels', async (req: AuthedRequest, res) => {
  const parsed = createLabelSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  if (!(await requireProjectLevel(req, req.params.workspaceId, req.params.projectId, 'EDIT'))) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const label = await prisma.label.create({
    data: { projectId: req.params.projectId, name: parsed.data.name, color: parsed.data.color },
  });
  res.status(201).json(label);
});

const createMilestoneSchema = z.object({
  name: z.string().min(1).max(120),
  dueDate: z.string().datetime().optional(),
});

projectsRouter.post('/:projectId/milestones', async (req: AuthedRequest, res) => {
  const parsed = createMilestoneSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  if (!(await requireProjectLevel(req, req.params.workspaceId, req.params.projectId, 'EDIT'))) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const milestone = await prisma.milestone.create({
    data: {
      projectId: req.params.projectId,
      name: parsed.data.name,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
    },
  });
  res.status(201).json(milestone);
});

const createSprintSchema = z.object({
  name: z.string().min(1).max(120),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

projectsRouter.post('/:projectId/sprints', async (req: AuthedRequest, res) => {
  const parsed = createSprintSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  if (!(await requireProjectLevel(req, req.params.workspaceId, req.params.projectId, 'EDIT'))) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const sprint = await prisma.sprint.create({
    data: {
      projectId: req.params.projectId,
      name: parsed.data.name,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : undefined,
      endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : undefined,
    },
  });
  res.status(201).json(sprint);
});

const updateSprintSchema = z.object({ status: z.enum(['PLANNED', 'ACTIVE', 'COMPLETED']) });

projectsRouter.patch('/:projectId/sprints/:sprintId', async (req: AuthedRequest, res) => {
  const parsed = updateSprintSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  if (!(await requireProjectLevel(req, req.params.workspaceId, req.params.projectId, 'EDIT'))) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const sprint = await prisma.sprint.update({
    where: { id: req.params.sprintId },
    data: { status: parsed.data.status },
  });
  res.json(sprint);
});
