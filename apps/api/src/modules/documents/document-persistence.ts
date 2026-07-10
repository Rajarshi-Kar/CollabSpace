import * as Y from 'yjs';
import { prisma } from '../../lib/prisma.js';

/**
 * Loads a document's Yjs state by applying the last compacted snapshot (if
 * any) followed by every incremental update logged since. This is the
 * standard Yjs "snapshot + update log" pattern: snapshots keep cold-load
 * fast, the log keeps every write durable without a compaction on every
 * keystroke.
 */
export async function loadDocState(documentId: string): Promise<Uint8Array | null> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { snapshot: true },
  });
  if (!document) return null;

  const ydoc = new Y.Doc();
  if (document.snapshot) {
    Y.applyUpdate(ydoc, new Uint8Array(document.snapshot));
  }

  const updates = await prisma.documentUpdate.findMany({
    where: { documentId },
    orderBy: { createdAt: 'asc' },
    select: { update: true },
  });
  for (const row of updates) {
    Y.applyUpdate(ydoc, new Uint8Array(row.update));
  }

  const state = Y.encodeStateAsUpdate(ydoc);
  ydoc.destroy();
  return state;
}

export async function appendUpdate(documentId: string, update: Uint8Array) {
  await prisma.documentUpdate.create({
    data: { documentId, update: Buffer.from(update) },
  });
}

/**
 * Compacts the update log into a new snapshot and clears the log, keeping
 * DocumentUpdate from growing without bound. Called on a debounce, not per
 * update, since it's the expensive path.
 */
export async function compactSnapshot(documentId: string, mergedState: Uint8Array) {
  await prisma.$transaction([
    prisma.document.update({
      where: { id: documentId },
      data: { snapshot: Buffer.from(mergedState), snapshotAt: new Date() },
    }),
    prisma.documentUpdate.deleteMany({ where: { documentId } }),
  ]);
}
