import type { NextFunction, Response } from 'express';
import type { PermissionLevel, ResourceType } from '@prisma/client';
import type { AuthedRequest } from './auth.js';
import { levelAtLeast, resolvePermission } from '../modules/permissions/permissions.service.js';

interface RequirePermissionOptions {
  resourceType: ResourceType;
  required: PermissionLevel;
  // Extracts organizationId, workspaceId, and resourceId from the request.
  params: (req: AuthedRequest) => { organizationId: string; workspaceId: string; resourceId: string };
}

export function requirePermission(options: RequirePermissionOptions) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    const { organizationId, workspaceId, resourceId } = options.params(req);
    const level = await resolvePermission({
      userId: req.userId as string,
      organizationId,
      workspaceId,
      resourceType: options.resourceType,
      resourceId,
    });

    if (!level || !levelAtLeast(level, options.required)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}
