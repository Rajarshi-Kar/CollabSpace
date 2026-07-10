import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.js';

export const foldersRouter = Router({ mergeParams: true });
foldersRouter.use(requireAuth);

async function requireWorkspaceMember(workspaceId: string, userId: string): Promise<boolean> {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) return false;
  const membership = await prisma.orgMember.findUnique({
    where: { organizationId_userId: { organizationId: workspace.organizationId, userId } },
  });
  return membership !== null;
}

const createFolderSchema = z.object({
  name: z.string().min(1).max(200),
  parentId: z.string().uuid().optional(),
});

foldersRouter.post('/', async (req: AuthedRequest, res) => {
  const parsed = createFolderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  if (!(await requireWorkspaceMember(req.params.workspaceId, req.userId as string))) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const folder = await prisma.folder.create({
    data: {
      workspaceId: req.params.workspaceId,
      name: parsed.data.name,
      parentId: parsed.data.parentId,
      createdById: req.userId as string,
    },
  });
  res.status(201).json(folder);
});

foldersRouter.get('/', async (req: AuthedRequest, res) => {
  if (!(await requireWorkspaceMember(req.params.workspaceId, req.userId as string))) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const parentId = typeof req.query.parentId === 'string' ? req.query.parentId : null;
  const folders = await prisma.folder.findMany({
    where: { workspaceId: req.params.workspaceId, parentId },
    orderBy: { name: 'asc' },
  });
  res.json(folders);
});

foldersRouter.delete('/:folderId', async (req: AuthedRequest, res) => {
  if (!(await requireWorkspaceMember(req.params.workspaceId, req.userId as string))) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  await prisma.folder.delete({ where: { id: req.params.folderId } });
  res.status(204).end();
});
