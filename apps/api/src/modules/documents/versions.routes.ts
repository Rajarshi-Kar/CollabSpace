import { Router } from 'express';
import { z } from 'zod';
import * as Y from 'yjs';
import { prisma } from '../../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.js';
import { levelAtLeast, resolvePermission } from '../permissions/permissions.service.js';
import { loadDocState } from './document-persistence.js';

export const versionsRouter = Router({ mergeParams: true });
versionsRouter.use(requireAuth);

async function requireLevel(
  req: AuthedRequest,
  required: 'VIEW' | 'COMMENT' | 'EDIT' | 'MANAGE',
): Promise<boolean> {
  const workspace = await prisma.workspace.findUnique({ where: { id: req.params.workspaceId } });
  if (!workspace) return false;
  const level = await resolvePermission({
    userId: req.userId as string,
    organizationId: workspace.organizationId,
    workspaceId: req.params.workspaceId,
    resourceType: 'DOCUMENT',
    resourceId: req.params.documentId,
  });
  return level !== null && levelAtLeast(level, required);
}

const createVersionSchema = z.object({ label: z.string().max(120).optional() });

// Manual "save named version" — periodic auto-snapshots happen via the Yjs
// sync server's debounce; this captures an explicit point the user can
// return to (e.g. before a big rewrite).
versionsRouter.post('/', async (req: AuthedRequest, res) => {
  const parsed = createVersionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  if (!(await requireLevel(req, 'EDIT'))) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const state = await loadDocState(req.params.documentId);
  if (!state) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }

  const version = await prisma.documentVersion.create({
    data: {
      documentId: req.params.documentId,
      snapshot: Buffer.from(state),
      label: parsed.data.label,
      createdById: req.userId as string,
    },
    select: { id: true, label: true, createdAt: true, createdById: true },
  });

  res.status(201).json(version);
});

versionsRouter.get('/', async (req: AuthedRequest, res) => {
  if (!(await requireLevel(req, 'VIEW'))) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const versions = await prisma.documentVersion.findMany({
    where: { documentId: req.params.documentId },
    select: { id: true, label: true, createdAt: true, createdById: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(versions);
});

// Returns the version's content as plain text extracted from the Yjs XML
// fragment, for a lightweight diff/preview without shipping binary state.
versionsRouter.get('/:versionId/preview', async (req: AuthedRequest, res) => {
  if (!(await requireLevel(req, 'VIEW'))) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const version = await prisma.documentVersion.findFirst({
    where: { id: req.params.versionId, documentId: req.params.documentId },
  });
  if (!version) {
    res.status(404).json({ error: 'Version not found' });
    return;
  }

  const ydoc = new Y.Doc();
  Y.applyUpdate(ydoc, new Uint8Array(version.snapshot));
  const text = ydoc.getXmlFragment('default').toString();
  ydoc.destroy();

  res.json({ id: version.id, label: version.label, createdAt: version.createdAt, preview: text });
});

// Restoring appends the version's state as a fresh Yjs update rather than
// overwriting history, so the restore itself is undoable and every prior
// state remains reconstructable from the update log.
versionsRouter.post('/:versionId/restore', async (req: AuthedRequest, res) => {
  if (!(await requireLevel(req, 'EDIT'))) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const version = await prisma.documentVersion.findFirst({
    where: { id: req.params.versionId, documentId: req.params.documentId },
  });
  if (!version) {
    res.status(404).json({ error: 'Version not found' });
    return;
  }

  const current = new Y.Doc();
  const currentState = await loadDocState(req.params.documentId);
  if (currentState) Y.applyUpdate(current, currentState);

  const target = new Y.Doc();
  Y.applyUpdate(target, new Uint8Array(version.snapshot));

  const diff = Y.encodeStateAsUpdate(target, Y.encodeStateVector(current));
  const { appendUpdate, compactSnapshot } = await import('./document-persistence.js');
  await appendUpdate(req.params.documentId, diff);
  Y.applyUpdate(current, diff);
  await compactSnapshot(req.params.documentId, Y.encodeStateAsUpdate(current));

  current.destroy();
  target.destroy();

  // TODO: if the doc has an active in-memory room in yjsServer.ts, this
  // write bypasses it until clients reconnect. Route restores through the
  // live room (broadcast the diff) once that's needed for a real editing session.
  res.json({ restored: version.id });
});
