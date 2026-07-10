export type OrgRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'GUEST';

export type PermissionLevel = 'VIEW' | 'COMMENT' | 'EDIT' | 'MANAGE';

export interface UserSummary {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// Domain events flowing through the event bus: realtime sockets, search
// indexing, notifications, and audit logging all derive from these.
export type DomainEventType =
  | 'organization.created'
  | 'workspace.created'
  | 'team.created'
  | 'invitation.created'
  | 'invitation.accepted'
  | 'document.updated'
  | 'task.created'
  | 'task.updated'
  | 'message.sent'
  | 'file.uploaded';

export interface DomainEvent<T = unknown> {
  type: DomainEventType;
  organizationId: string;
  actorId: string;
  payload: T;
  occurredAt: string;
}
