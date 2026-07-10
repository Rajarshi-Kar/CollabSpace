import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { emitDomainEvent } from '../../lib/events.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.js';

export const teamsRouter = Router({ mergeParams: true });
teamsRouter.use(requireAuth);

async function requireOrgAdmin(organizationId: string, userId: string) {
  const membership = await prisma.orgMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
  });
  return membership && (membership.role === 'OWNER' || membership.role === 'ADMIN') ? membership : null;
}

const createTeamSchema = z.object({ name: z.string().min(1).max(80) });

teamsRouter.post('/', async (req: AuthedRequest, res) => {
  const parsed = createTeamSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  if (!(await requireOrgAdmin(req.params.orgId, req.userId as string))) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const team = await prisma.team.create({
    data: { organizationId: req.params.orgId, name: parsed.data.name },
  });

  await emitDomainEvent({
    type: 'team.created',
    organizationId: req.params.orgId,
    actorId: req.userId as string,
    targetType: 'team',
    targetId: team.id,
    payload: { name: team.name },
  });

  res.status(201).json(team);
});

teamsRouter.get('/', async (req: AuthedRequest, res) => {
  const membership = await prisma.orgMember.findUnique({
    where: { organizationId_userId: { organizationId: req.params.orgId, userId: req.userId as string } },
  });
  if (!membership) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const teams = await prisma.team.findMany({
    where: { organizationId: req.params.orgId },
    include: { members: true },
  });
  res.json(teams);
});

const addMemberSchema = z.object({ orgMemberId: z.string().uuid() });

teamsRouter.post('/:teamId/members', async (req: AuthedRequest, res) => {
  const parsed = addMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  if (!(await requireOrgAdmin(req.params.orgId, req.userId as string))) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const team = await prisma.team.findFirst({
    where: { id: req.params.teamId, organizationId: req.params.orgId },
  });
  if (!team) {
    res.status(404).json({ error: 'Team not found' });
    return;
  }

  const teamMember = await prisma.teamMember.create({
    data: { teamId: team.id, orgMemberId: parsed.data.orgMemberId },
  });

  res.status(201).json(teamMember);
});
