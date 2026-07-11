import { Router } from 'express';
import { z } from 'zod';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { prisma } from '../../lib/prisma.js';
import { emitDomainEvent } from '../../lib/events.js';
import { enqueueIndex } from '../../lib/search-index.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.js';
import { BUCKET, buildStorageKey, deleteObject, presignDownload, presignUpload, s3 } from '../../lib/storage.js';
import { mediaQueue } from '../../lib/queues.js';

export const filesRouter = Router({ mergeParams: true });
filesRouter.use(requireAuth);

async function getWorkspace(workspaceId: string) {
  return prisma.workspace.findUnique({ where: { id: workspaceId } });
}

async function requireWorkspaceMember(workspaceId: string, userId: string): Promise<string | null> {
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return null;
  const membership = await prisma.orgMember.findUnique({
    where: { organizationId_userId: { organizationId: workspace.organizationId, userId } },
  });
  return membership ? workspace.organizationId : null;
}

async function currentStorageUsage(workspaceId: string): Promise<bigint> {
  const result = await prisma.fileVersion.aggregate({
    where: { currentFor: { workspaceId } },
    _sum: { sizeBytes: true },
  });
  return result._sum.sizeBytes ?? 0n;
}

const uploadUrlSchema = z.object({
  name: z.string().min(1).max(300),
  mimeType: z.string().min(1).max(200),
  sizeBytes: z.number().int().positive(),
  folderId: z.string().uuid().optional(),
});

filesRouter.post('/upload-url', async (req: AuthedRequest, res) => {
  const parsed = uploadUrlSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const organizationId = await requireWorkspaceMember(req.params.workspaceId, req.userId as string);
  if (!organizationId) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const workspace = await getWorkspace(req.params.workspaceId);
  const usage = await currentStorageUsage(req.params.workspaceId);
  if (usage + BigInt(parsed.data.sizeBytes) > (workspace?.storageQuotaBytes ?? 0n)) {
    res.status(413).json({ error: 'Storage quota exceeded' });
    return;
  }

  // File + a not-yet-uploaded FileVersion are created upfront so the
  // presigned URL can point at a known key; /complete verifies the real
  // object landed (and its true size) before the version becomes current.
  const { file, version, storageKey } = await prisma.$transaction(async (tx) => {
    const created = await tx.file.create({
      data: {
        workspaceId: req.params.workspaceId,
        folderId: parsed.data.folderId,
        name: parsed.data.name,
        mimeType: parsed.data.mimeType,
        createdById: req.userId as string,
      },
    });
    const key = buildStorageKey(req.params.workspaceId, created.id, 1);
    const createdVersion = await tx.fileVersion.create({
      data: {
        fileId: created.id,
        versionNumber: 1,
        storageKey: key,
        sizeBytes: parsed.data.sizeBytes,
        uploadedById: req.userId as string,
      },
    });
    return { file: created, version: createdVersion, storageKey: key };
  });

  const uploadUrl = await presignUpload(storageKey, parsed.data.mimeType);
  res.status(201).json({ fileId: file.id, versionId: version.id, uploadUrl });
});

filesRouter.post('/:fileId/complete', async (req: AuthedRequest, res) => {
  const organizationId = await requireWorkspaceMember(req.params.workspaceId, req.userId as string);
  if (!organizationId) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const file = await prisma.file.findFirst({
    where: { id: req.params.fileId, workspaceId: req.params.workspaceId },
    include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
  });
  const pendingVersion = file?.versions[0];
  if (!file || !pendingVersion) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  const head = await s3
    .send(new HeadObjectCommand({ Bucket: BUCKET, Key: pendingVersion.storageKey }))
    .catch(() => null);
  if (!head || head.ContentLength === undefined) {
    res.status(400).json({ error: 'Upload not found in storage — retry the upload' });
    return;
  }

  const actualSize = BigInt(head.ContentLength);
  const workspace = await getWorkspace(req.params.workspaceId);
  const usageExcludingThis = (await currentStorageUsage(req.params.workspaceId)) - pendingVersion.sizeBytes;
  if (usageExcludingThis + actualSize > (workspace?.storageQuotaBytes ?? 0n)) {
    await deleteObject(pendingVersion.storageKey);
    await prisma.file.delete({ where: { id: file.id } });
    res.status(413).json({ error: 'Storage quota exceeded' });
    return;
  }

  const [, updatedFile] = await prisma.$transaction([
    prisma.fileVersion.update({ where: { id: pendingVersion.id }, data: { sizeBytes: actualSize } }),
    prisma.file.update({ where: { id: file.id }, data: { currentVersionId: pendingVersion.id } }),
  ]);

  await emitDomainEvent({
    type: 'file.uploaded',
    organizationId,
    actorId: req.userId as string,
    targetType: 'file',
    targetId: file.id,
    payload: { name: file.name, mimeType: file.mimeType, sizeBytes: actualSize.toString() },
  });

  if (file.mimeType.startsWith('image/') || file.mimeType === 'application/pdf') {
    await mediaQueue.add('process', {
      fileId: file.id,
      storageKey: pendingVersion.storageKey,
      mimeType: file.mimeType,
    });
  }

  await enqueueIndex({
    entityType: 'file',
    action: 'upsert',
    id: file.id,
    organizationId,
    workspaceId: req.params.workspaceId,
    resourceType: 'WORKSPACE',
    resourceId: req.params.workspaceId,
    fields: { name: file.name, mimeType: file.mimeType },
  });

  res.json(updatedFile);
});

filesRouter.get('/', async (req: AuthedRequest, res) => {
  if (!(await requireWorkspaceMember(req.params.workspaceId, req.userId as string))) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const folderId = typeof req.query.folderId === 'string' ? req.query.folderId : null;
  const files = await prisma.file.findMany({
    where: { workspaceId: req.params.workspaceId, folderId, currentVersionId: { not: null } },
    include: { currentVersion: true },
    orderBy: { name: 'asc' },
  });
  res.json(files);
});

filesRouter.get('/:fileId/download', async (req: AuthedRequest, res) => {
  if (!(await requireWorkspaceMember(req.params.workspaceId, req.userId as string))) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const file = await prisma.file.findFirst({
    where: { id: req.params.fileId, workspaceId: req.params.workspaceId },
    include: { currentVersion: true },
  });
  if (!file || !file.currentVersion) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  const url = await presignDownload(file.currentVersion.storageKey, file.name);
  await prisma.fileDownload.create({
    data: { fileId: file.id, downloadedById: req.userId as string },
  });

  res.json({ url });
});

filesRouter.get('/:fileId/downloads', async (req: AuthedRequest, res) => {
  if (!(await requireWorkspaceMember(req.params.workspaceId, req.userId as string))) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const downloads = await prisma.fileDownload.findMany({
    where: { fileId: req.params.fileId },
    include: { downloadedBy: { select: { id: true, displayName: true } } },
    orderBy: { downloadedAt: 'desc' },
    take: 100,
  });
  res.json(downloads);
});

filesRouter.get('/:fileId/versions', async (req: AuthedRequest, res) => {
  if (!(await requireWorkspaceMember(req.params.workspaceId, req.userId as string))) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const versions = await prisma.fileVersion.findMany({
    where: { fileId: req.params.fileId },
    orderBy: { versionNumber: 'desc' },
  });
  res.json(versions);
});

filesRouter.delete('/:fileId', async (req: AuthedRequest, res) => {
  const organizationId = await requireWorkspaceMember(req.params.workspaceId, req.userId as string);
  if (!organizationId) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const versions = await prisma.fileVersion.findMany({ where: { fileId: req.params.fileId } });
  await prisma.file.delete({ where: { id: req.params.fileId } });
  await Promise.all(versions.map((v) => deleteObject(v.storageKey)));
  await enqueueIndex({
    entityType: 'file',
    action: 'delete',
    id: req.params.fileId,
    organizationId,
    workspaceId: req.params.workspaceId,
    resourceType: 'WORKSPACE',
    resourceId: req.params.workspaceId,
    fields: {},
  });
  res.status(204).end();
});

filesRouter.get('/usage', async (req: AuthedRequest, res) => {
  if (!(await requireWorkspaceMember(req.params.workspaceId, req.userId as string))) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const workspace = await getWorkspace(req.params.workspaceId);
  const usedBytes = await currentStorageUsage(req.params.workspaceId);
  res.json({
    usedBytes: usedBytes.toString(),
    quotaBytes: (workspace?.storageQuotaBytes ?? 0n).toString(),
  });
});
