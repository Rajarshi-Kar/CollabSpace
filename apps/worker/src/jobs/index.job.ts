import type { Job } from 'bullmq';

export interface IndexJobData {
  entityType: 'document' | 'task' | 'message' | 'file' | 'user';
  entityId: string;
  organizationId: string;
}

export async function processIndexJob(job: Job<IndexJobData>) {
  // TODO(Phase 7): fetch entity, push to Meilisearch index scoped by organizationId.
  console.log(`[index] ${job.data.entityType}:${job.data.entityId}`);
}
