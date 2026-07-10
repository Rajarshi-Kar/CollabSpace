import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync.js';
import * as awarenessProtocol from 'y-protocols/awareness.js';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { verifyAccessToken } from '../lib/jwt.js';
import { resolvePermission, levelAtLeast } from '../modules/permissions/permissions.service.js';
import { prisma } from '../lib/prisma.js';
import { appendUpdate, compactSnapshot, loadDocState } from '../modules/documents/document-persistence.js';

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const SNAPSHOT_DEBOUNCE_MS = 10_000;

interface DocRoom {
  ydoc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  clients: Set<WebSocket>;
  snapshotTimer: NodeJS.Timeout | null;
}

const rooms = new Map<string, DocRoom>();

async function getOrLoadRoom(documentId: string): Promise<DocRoom> {
  const existing = rooms.get(documentId);
  if (existing) return existing;

  const ydoc = new Y.Doc();
  const state = await loadDocState(documentId);
  if (state) Y.applyUpdate(ydoc, state);

  const room: DocRoom = {
    ydoc,
    awareness: new awarenessProtocol.Awareness(ydoc),
    clients: new Set(),
    snapshotTimer: null,
  };

  ydoc.on('update', (update: Uint8Array) => {
    void appendUpdate(documentId, update);
    scheduleSnapshot(documentId, room);
    broadcastUpdate(room, update);
  });

  rooms.set(documentId, room);
  return room;
}

function scheduleSnapshot(documentId: string, room: DocRoom) {
  if (room.snapshotTimer) clearTimeout(room.snapshotTimer);
  room.snapshotTimer = setTimeout(() => {
    const merged = Y.encodeStateAsUpdate(room.ydoc);
    void compactSnapshot(documentId, merged);
  }, SNAPSHOT_DEBOUNCE_MS);
}

function broadcastUpdate(room: DocRoom, update: Uint8Array) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.writeUpdate(encoder, update);
  const message = encoding.toUint8Array(encoder);
  for (const client of room.clients) {
    if (client.readyState === client.OPEN) client.send(message);
  }
}

async function authorizeDocument(documentId: string, token: string) {
  const payload = verifyAccessToken(token);
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { workspaceId: true, workspace: { select: { organizationId: true } } },
  });
  if (!document) return null;

  const level = await resolvePermission({
    userId: payload.sub,
    organizationId: document.workspace.organizationId,
    workspaceId: document.workspaceId,
    resourceType: 'DOCUMENT',
    resourceId: documentId,
  });
  if (!level || !levelAtLeast(level, 'COMMENT')) return null;

  return { userId: payload.sub, canEdit: levelAtLeast(level, 'EDIT') };
}

export function attachYjsServer(httpServer: HttpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    if (!req.url?.startsWith('/yjs/')) return;
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', async (ws: WebSocket, req) => {
    const url = new URL(req.url ?? '', 'http://internal');
    const documentId = url.pathname.replace('/yjs/', '');
    const token = url.searchParams.get('token') ?? '';

    const auth = await authorizeDocument(documentId, token).catch(() => null);
    if (!auth) {
      ws.close(4401, 'unauthorized');
      return;
    }

    const room = await getOrLoadRoom(documentId);
    room.clients.add(ws);

    // Initial sync step 1: tell the client what we have so it can compute a diff.
    const syncEncoder = encoding.createEncoder();
    encoding.writeVarUint(syncEncoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(syncEncoder, room.ydoc);
    ws.send(encoding.toUint8Array(syncEncoder));

    ws.on('message', (data: Buffer) => {
      const decoder = decoding.createDecoder(new Uint8Array(data));
      const messageType = decoding.readVarUint(decoder);

      if (messageType === MESSAGE_SYNC) {
        if (!auth.canEdit) return; // view/comment-only clients may still read, never write
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        syncProtocol.readSyncMessage(decoder, encoder, room.ydoc, ws);
        if (encoding.length(encoder) > 1) ws.send(encoding.toUint8Array(encoder));
      } else if (messageType === MESSAGE_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(room.awareness, decoding.readVarUint8Array(decoder), ws);
      }
    });

    ws.on('close', () => {
      room.clients.delete(ws);
      awarenessProtocol.removeAwarenessStates(room.awareness, [], ws);
      if (room.clients.size === 0) {
        const merged = Y.encodeStateAsUpdate(room.ydoc);
        void compactSnapshot(documentId, merged);
        if (room.snapshotTimer) clearTimeout(room.snapshotTimer);
        rooms.delete(documentId);
      }
    });
  });

  return wss;
}
