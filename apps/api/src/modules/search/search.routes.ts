import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.js';
import { INDEX_NAMES, meili } from '../../lib/search.js';
import { levelAtLeast, resolvePermission } from '../permissions/permissions.service.js';
import { isChannelMember } from '../messaging/channels.routes.js';

export const searchRouter = Router({ mergeParams: true });
searchRouter.use(requireAuth);

// Meilisearch has no per-user ACL, so we over-fetch and post-filter by
// permission rather than trusting the index to return only visible hits.
const OVERFETCH_MULTIPLIER = 3;

interface SearchHit {
  id: string;
  resourceType: string;
  resourceId: string;
  [key: string]: unknown;
}

async function isVisible(
  userId: string,
  organizationId: string,
  workspaceId: string,
  hit: SearchHit,
): Promise<boolean> {
  if (hit.resourceType === 'CHANNEL') {
    return isChannelMember(hit.resourceId, userId);
  }
  if (hit.resourceType === 'WORKSPACE') {
    const membership = await prisma.orgMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    return membership !== null;
  }
  const level = await resolvePermission({
    userId,
    organizationId,
    workspaceId,
    resourceType: hit.resourceType as 'DOCUMENT' | 'PROJECT',
    resourceId: hit.resourceId,
  });
  return level !== null && levelAtLeast(level, 'VIEW');
}

const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  types: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',') : Object.keys(INDEX_NAMES))),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// Global search across documents/tasks/messages/files within a workspace.
// Meilisearch does the ranking and free-text matching; permission
// enforcement happens here afterward per-hit, since the index itself has no
// concept of per-user ACLs.
searchRouter.get('/', async (req: AuthedRequest, res) => {
  const parsed = searchQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const workspace = await prisma.workspace.findUnique({ where: { id: req.params.workspaceId } });
  if (!workspace) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }
  const membership = await prisma.orgMember.findUnique({
    where: { organizationId_userId: { organizationId: workspace.organizationId, userId: req.userId as string } },
  });
  if (!membership) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const requestedTypes = parsed.data.types.filter(
    (t): t is keyof typeof INDEX_NAMES => t in INDEX_NAMES && t !== 'person',
  );

  const results = await Promise.all(
    requestedTypes.map(async (type) => {
      const searchResult = await meili.index(INDEX_NAMES[type]).search(parsed.data.q, {
        filter: `workspaceId = "${req.params.workspaceId}"`,
        limit: parsed.data.limit * OVERFETCH_MULTIPLIER,
      });

      const visible = [];
      for (const hit of searchResult.hits as SearchHit[]) {
        if (await isVisible(req.userId as string, workspace.organizationId, req.params.workspaceId, hit)) {
          visible.push({ type, ...hit });
        }
        if (visible.length >= parsed.data.limit) break;
      }
      return visible;
    }),
  );

  res.json({ query: parsed.data.q, results: results.flat() });
});

const peopleSearchQuerySchema = z.object({ q: z.string().min(1).max(200) });

searchRouter.get('/people', async (req: AuthedRequest, res) => {
  const parsed = peopleSearchQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const workspace = await prisma.workspace.findUnique({ where: { id: req.params.workspaceId } });
  if (!workspace) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }
  const membership = await prisma.orgMember.findUnique({
    where: { organizationId_userId: { organizationId: workspace.organizationId, userId: req.userId as string } },
  });
  if (!membership) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const searchResult = await meili.index(INDEX_NAMES.person).search(parsed.data.q, {
    filter: `organizationId = "${workspace.organizationId}"`,
    limit: 20,
  });
  res.json({ query: parsed.data.q, results: searchResult.hits });
});
