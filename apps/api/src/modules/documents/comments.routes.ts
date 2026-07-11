import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { emitDomainEvent } from '../../lib/events.js';
import { notify } from '../../lib/notify.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.js';
import { levelAtLeast, resolvePermission } from '../permissions/permissions.service.js';

export const commentsRouter = Router({ mergeParams: true });
commentsRouter.use(requireAuth);

async function requireLevel(
  req: AuthedRequest,
  required: 'VIEW' | 'COMMENT' | 'EDIT' | 'MANAGE',
): Promise<string | null> {
  const workspace = await prisma.workspace.findUnique({ where: { id: req.params.workspaceId } });
  if (!workspace) return null;
  const level = await resolvePermission({
    userId: req.userId as string,
    organizationId: workspace.organizationId,
    workspaceId: req.params.workspaceId,
    resourceType: 'DOCUMENT',
    resourceId: req.params.documentId,
  });
  if (!level || !levelAtLeast(level, required)) return null;
  return workspace.organizationId;
}

const createCommentSchema = z.object({
  body: z.string().min(1).max(4000),
  anchor: z.unknown(),
  parentId: z.string().uuid().optional(),
});

commentsRouter.post('/', async (req: AuthedRequest, res) => {
  const parsed = createCommentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const organizationId = await requireLevel(req, 'COMMENT');
  if (!organizationId) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const comment = await prisma.comment.create({
    data: {
      documentId: req.params.documentId,
      authorId: req.userId as string,
      body: parsed.data.body,
      anchor: parsed.data.anchor as never,
      parentId: parsed.data.parentId,
    },
  });

  await emitDomainEvent({
    type: 'document.updated',
    organizationId,
    actorId: req.userId as string,
    targetType: 'comment',
    targetId: comment.id,
    payload: { action: 'comment-created', documentId: req.params.documentId },
  });

  const notifyTargets = new Set<string>();
  const document = await prisma.document.findUnique({
    where: { id: req.params.documentId },
    select: { createdById: true, title: true },
  });
  if (document && document.createdById !== req.userId) notifyTargets.add(document.createdById);

  if (parsed.data.parentId) {
    const parentComment = await prisma.comment.findUnique({
      where: { id: parsed.data.parentId },
      select: { authorId: true },
    });
    if (parentComment && parentComment.authorId !== req.userId) notifyTargets.add(parentComment.authorId);
  }

  await Promise.all(
    Array.from(notifyTargets).map((userId) =>
      notify({
        userId,
        organizationId,
        type: 'COMMENT',
        payload: { documentId: req.params.documentId, commentId: comment.id, title: document?.title },
      }),
    ),
  );

  res.status(201).json(comment);
});

commentsRouter.get('/', async (req: AuthedRequest, res) => {
  if (!(await requireLevel(req, 'VIEW'))) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const comments = await prisma.comment.findMany({
    where: { documentId: req.params.documentId },
    orderBy: { createdAt: 'asc' },
  });
  res.json(comments);
});

commentsRouter.post('/:commentId/resolve', async (req: AuthedRequest, res) => {
  if (!(await requireLevel(req, 'COMMENT'))) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const comment = await prisma.comment.update({
    where: { id: req.params.commentId },
    data: { resolvedAt: new Date() },
  });
  res.json(comment);
});
