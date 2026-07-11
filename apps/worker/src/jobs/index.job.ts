import type { Job } from 'bullmq';
import type { SearchIndexJob } from '@collabspace/shared';
import { INDEX_NAMES, meili } from '../lib/search.js';

// People are keyed per-org (a user can belong to several orgs, each needing
// its own searchable row), everything else is already globally unique.
function documentId(job: SearchIndexJob): string {
  return job.entityType === 'person' ? `${job.organizationId}:${job.id}` : job.id;
}

export async function processIndexJob(job: Job<SearchIndexJob>) {
  const { data } = job;
  const index = meili.index(INDEX_NAMES[data.entityType]);
  const id = documentId(data);

  if (data.action === 'delete') {
    await index.deleteDocument(id);
    return;
  }

  await index.addDocuments([
    {
      id,
      organizationId: data.organizationId,
      workspaceId: data.workspaceId,
      resourceType: data.resourceType,
      resourceId: data.resourceId,
      ...data.fields,
    },
  ]);
}
