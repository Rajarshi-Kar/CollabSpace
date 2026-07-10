import { prisma } from '../../lib/prisma.js';
import type { OrgRole, PermissionLevel, ResourceType } from '@prisma/client';

const LEVEL_RANK: Record<PermissionLevel, number> = {
  VIEW: 1,
  COMMENT: 2,
  EDIT: 3,
  MANAGE: 4,
};

// Default resource access implied by an org-wide role, before any
// resource-specific overrides are applied. GUESTs get nothing by default —
// they must be granted explicit overrides per resource.
const ROLE_BASE_LEVEL: Record<OrgRole, PermissionLevel | null> = {
  OWNER: 'MANAGE',
  ADMIN: 'MANAGE',
  MEMBER: 'EDIT',
  GUEST: null,
};

export function levelAtLeast(level: PermissionLevel, required: PermissionLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[required];
}

/**
 * Resolves a user's effective permission level on a resource by layering:
 * org role (base) -> workspace-scoped overrides for the user -> for the
 * user's teams. The highest applicable level wins; a GUEST with no override
 * has no access.
 */
export async function resolvePermission(params: {
  userId: string;
  organizationId: string;
  workspaceId: string;
  resourceType: ResourceType;
  resourceId: string;
}): Promise<PermissionLevel | null> {
  const { userId, organizationId, workspaceId, resourceType, resourceId } = params;

  const membership = await prisma.orgMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    include: { teamMemberships: true },
  });
  if (!membership) return null;

  let level: PermissionLevel | null = ROLE_BASE_LEVEL[membership.role];

  const teamIds = membership.teamMemberships.map((tm) => tm.teamId);
  const subjectFilters: Array<{ subjectType: string; subjectId: string | { in: string[] } }> = [
    { subjectType: 'user', subjectId: userId },
  ];
  if (teamIds.length > 0) {
    subjectFilters.push({ subjectType: 'team', subjectId: { in: teamIds } });
  }

  const overrides = await prisma.permissionOverride.findMany({
    where: { workspaceId, resourceType, resourceId, OR: subjectFilters },
  });

  for (const override of overrides) {
    if (level === null || LEVEL_RANK[override.level] > LEVEL_RANK[level]) {
      level = override.level;
    }
  }

  return level;
}
