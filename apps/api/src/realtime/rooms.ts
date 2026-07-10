import { prisma } from '../lib/prisma.js';

export type RoomAuthResult = { allowed: true; organizationId: string } | { allowed: false };

/**
 * Authorizes a socket to join a room name of the form "org:<id>" or
 * "workspace:<id>". Document/channel/project rooms will extend this once
 * those resources exist (Phase 3+) by delegating to the permission
 * resolution service instead of a plain membership check.
 */
export async function authorizeRoom(room: string, userId: string): Promise<RoomAuthResult> {
  const [kind, id] = room.split(':', 2);
  if (!kind || !id) return { allowed: false };

  if (kind === 'org') {
    const membership = await prisma.orgMember.findUnique({
      where: { organizationId_userId: { organizationId: id, userId } },
    });
    return membership ? { allowed: true, organizationId: id } : { allowed: false };
  }

  if (kind === 'workspace') {
    const workspace = await prisma.workspace.findUnique({ where: { id } });
    if (!workspace) return { allowed: false };
    const membership = await prisma.orgMember.findUnique({
      where: { organizationId_userId: { organizationId: workspace.organizationId, userId } },
    });
    return membership ? { allowed: true, organizationId: workspace.organizationId } : { allowed: false };
  }

  return { allowed: false };
}
