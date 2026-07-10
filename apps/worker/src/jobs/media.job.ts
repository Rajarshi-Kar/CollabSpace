import type { Job } from 'bullmq';

export interface MediaJobData {
  fileId: string;
  storageKey: string;
  mimeType: string;
}

export async function processMediaJob(job: Job<MediaJobData>) {
  // TODO(Phase 9+): fetch the object from S3/MinIO, generate a thumbnail for
  // image/* and a first-page preview for PDFs, upload the derivative back
  // under a `thumbnails/` prefix, and record its key on the File row.
  console.log(`[media] processing ${job.data.mimeType} for file ${job.data.fileId}`);
}
