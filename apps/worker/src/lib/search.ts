import { MeiliSearch } from 'meilisearch';

export const meili = new MeiliSearch({
  host: process.env.MEILI_HOST ?? 'http://localhost:7700',
  apiKey: process.env.MEILI_MASTER_KEY,
});

export const INDEX_NAMES = {
  document: 'documents',
  task: 'tasks',
  message: 'messages',
  file: 'files',
  person: 'people',
} as const;

// Filterable attributes are what the search endpoint scopes queries by
// (workspace/org membership) before any per-result permission check runs;
// searchable attributes are what free-text queries match against.
export async function ensureIndexes() {
  await meili.createIndex(INDEX_NAMES.document, { primaryKey: 'id' }).catch(() => undefined);
  await meili.index(INDEX_NAMES.document).updateSettings({
    searchableAttributes: ['title', 'content'],
    filterableAttributes: ['organizationId', 'workspaceId', 'resourceId'],
  });

  await meili.createIndex(INDEX_NAMES.task, { primaryKey: 'id' }).catch(() => undefined);
  await meili.index(INDEX_NAMES.task).updateSettings({
    searchableAttributes: ['title', 'description'],
    filterableAttributes: ['organizationId', 'workspaceId', 'resourceId', 'status', 'priority'],
  });

  await meili.createIndex(INDEX_NAMES.message, { primaryKey: 'id' }).catch(() => undefined);
  await meili.index(INDEX_NAMES.message).updateSettings({
    searchableAttributes: ['body'],
    filterableAttributes: ['organizationId', 'workspaceId', 'resourceId', 'channelId'],
  });

  await meili.createIndex(INDEX_NAMES.file, { primaryKey: 'id' }).catch(() => undefined);
  await meili.index(INDEX_NAMES.file).updateSettings({
    searchableAttributes: ['name'],
    filterableAttributes: ['organizationId', 'workspaceId', 'resourceId', 'mimeType'],
  });

  await meili.createIndex(INDEX_NAMES.person, { primaryKey: 'id' }).catch(() => undefined);
  await meili.index(INDEX_NAMES.person).updateSettings({
    searchableAttributes: ['displayName', 'email'],
    filterableAttributes: ['organizationId'],
  });
}
