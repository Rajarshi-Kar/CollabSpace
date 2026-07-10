import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { emitDomainEvent } from '../../lib/events.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.js';
import { levelAtLeast, resolvePermission } from '../permissions/permissions.service.js';

export const documentsRouter = Router({ mergeParams: true });
documentsRouter.use(requireAuth);

async function getWorkspaceOrg(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  return workspace?.organizationId ?? null;
}

async function requireDocLevel(
  req: AuthedRequest,
  workspaceId: string,
  documentId: string,
  required: 'VIEW' | 'COMMENT' | 'EDIT' | 'MANAGE',
) {
  const organizationId = await getWorkspaceOrg(workspaceId);
  if (!organizationId) return false;
  const level = await resolvePermission({
    userId: req.userId as string,
    organizationId,
    workspaceId,
    resourceType: 'DOCUMENT',
    resourceId: documentId,
  });
  return level !== null && levelAtLeast(level, required);
}

const createDocumentSchema = z.object({
  title: z.string().min(1).max(200),
  parentId: z.string().uuid().optional(),
  isTemplate: z.boolean().optional(),
});

documentsRouter.post('/', async (req: AuthedRequest, res) => {
  const parsed = createDocumentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const organizationId = await getWorkspaceOrg(req.params.workspaceId);
  if (!organizationId) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }

  // New documents inherit the creator's workspace-level access; explicit
  // per-document overrides can be granted afterwards via /share.
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

  const document = await prisma.document.create({
    data: {
      workspaceId: req.params.workspaceId,
      title: parsed.data.title,
      parentId: parsed.data.parentId,
      isTemplate: parsed.data.isTemplate ?? false,
      createdById: req.userId as string,
    },
  });

  await emitDomainEvent({
    type: 'document.updated',
    organizationId,
    actorId: req.userId as string,
    targetType: 'document',
    targetId: document.id,
    payload: { action: 'created', title: document.title },
  });

  res.status(201).json(document);
});

documentsRouter.get('/', async (req: AuthedRequest, res) => {
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

  const documents = await prisma.document.findMany({
    where: { workspaceId: req.params.workspaceId, archivedAt: null },
    select: {
      id: true,
      title: true,
      icon: true,
      parentId: true,
      isTemplate: true,
      createdById: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });
  res.json(documents);
});

documentsRouter.get('/:documentId', async (req: AuthedRequest, res) => {
  if (!(await requireDocLevel(req, req.params.workspaceId, req.params.documentId, 'VIEW'))) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const document = await prisma.document.findFirst({
    where: { id: req.params.documentId, workspaceId: req.params.workspaceId },
  });
  if (!document) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }
  res.json({ ...document, snapshot: undefined }); // binary CRDT state travels over /yjs, not REST
});

const updateDocumentSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  icon: z.string().max(16).nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  archivedAt: z.string().datetime().nullable().optional(),
});

documentsRouter.patch('/:documentId', async (req: AuthedRequest, res) => {
  const parsed = updateDocumentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  if (!(await requireDocLevel(req, req.params.workspaceId, req.params.documentId, 'EDIT'))) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const document = await prisma.document.update({
    where: { id: req.params.documentId },
    data: {
      title: parsed.data.title,
      icon: parsed.data.icon,
      parentId: parsed.data.parentId,
      archivedAt: parsed.data.archivedAt ? new Date(parsed.data.archivedAt) : parsed.data.archivedAt,
    },
  });

  const organizationId = await getWorkspaceOrg(req.params.workspaceId);
  await emitDomainEvent({
    type: 'document.updated',
    organizationId: organizationId as string,
    actorId: req.userId as string,
    targetType: 'document',
    targetId: document.id,
    payload: { action: 'metadata-updated' },
  });

  res.json(document);
});

const shareDocumentSchema = z.object({
  subjectType: z.enum(['user', 'team']),
  subjectId: z.string().uuid(),
  level: z.enum(['VIEW', 'COMMENT', 'EDIT', 'MANAGE']),
});

documentsRouter.post('/:documentId/share', async (req: AuthedRequest, res) => {
  const parsed = shareDocumentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  if (!(await requireDocLevel(req, req.params.workspaceId, req.params.documentId, 'MANAGE'))) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const override = await prisma.permissionOverride.upsert({
    where: {
      resourceType_resourceId_subjectType_subjectId: {
        resourceType: 'DOCUMENT',
        resourceId: req.params.documentId,
        subjectType: parsed.data.subjectType,
        subjectId: parsed.data.subjectId,
      },
    },
    create: {
      workspaceId: req.params.workspaceId,
      resourceType: 'DOCUMENT',
      resourceId: req.params.documentId,
      subjectType: parsed.data.subjectType,
      subjectId: parsed.data.subjectId,
      level: parsed.data.level,
    },
    update: { level: parsed.data.level },
  });

  res.status(201).json(override);
});
