import type { Job } from 'bullmq';

export interface EmailJobData {
  to: string;
  template: 'invitation' | 'task-reminder' | 'mention' | 'digest';
  data: Record<string, unknown>;
}

export async function processEmailJob(job: Job<EmailJobData>) {
  // TODO(Phase 8): wire real email provider (e.g. Resend/SES). Logging for now.
  console.log(`[email] sending "${job.data.template}" to ${job.data.to}`);
}
