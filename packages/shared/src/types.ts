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
  | 'project.created'
  | 'task.created'
  | 'task.updated'
  | 'channel.created'
  | 'message.sent'
  | 'file.uploaded';

export interface DomainEvent<T = unknown> {
  type: DomainEventType;
  organizationId: string;
  actorId: string;
  payload: T;
  occurredAt: string;
}

// Search-index job payloads (BullMQ "index" queue): the API denormalizes
// the searchable fields at write time and hands them to the worker, which
// only talks to Meilisearch — it never queries Postgres itself, avoiding a
// second data-access layer and any staleness from a delayed re-fetch.
export type SearchEntityType = 'document' | 'task' | 'message' | 'file' | 'person';

export interface SearchIndexJob {
  entityType: SearchEntityType;
  action: 'upsert' | 'delete';
  id: string;
  organizationId: string;
  // Null for org-wide entities (people) that aren't scoped to one workspace.
  workspaceId: string | null;
  // Resource used for permission-filtering search results: documents and
  // tasks are gated by their DOCUMENT/PROJECT-scoped PermissionOverride,
  // messages by channel membership, files/people by plain workspace or org
  // membership (they're not ACL-graded per-resource).
  resourceType: 'DOCUMENT' | 'PROJECT' | 'CHANNEL' | 'WORKSPACE' | 'ORGANIZATION';
  resourceId: string;
  fields: Record<string, unknown>;
}
