import 'dotenv/config';
import { Worker, type ConnectionOptions } from 'bullmq';
import { processEmailJob } from './jobs/email.job.js';
import { processIndexJob } from './jobs/index.job.js';
import { processMediaJob } from './jobs/media.job.js';
import { ensureIndexes } from './lib/search.js';

const connection: ConnectionOptions = { url: process.env.REDIS_URL ?? 'redis://localhost:6379' } as never;
const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 5);

await ensureIndexes().catch((err) => {
  console.error('failed to bootstrap Meilisearch indexes (worker will keep running, index jobs may fail):', err);
});

const emailWorker = new Worker('email', processEmailJob, { connection, concurrency });
const indexWorker = new Worker('index', processIndexJob, { connection, concurrency });
const mediaWorker = new Worker('media', processMediaJob, { connection, concurrency });

for (const worker of [emailWorker, indexWorker, mediaWorker]) {
  worker.on('failed', (job, err) => {
    console.error(`[${worker.name}] job ${job?.id} failed:`, err.message);
  });
}

console.log('worker started: queues = [email, index, media]');
