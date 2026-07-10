import { Queue } from 'bullmq';

const connection = { url: process.env.REDIS_URL ?? 'redis://localhost:6379' } as never;

export const emailQueue = new Queue('email', { connection });
export const indexQueue = new Queue('index', { connection });
export const mediaQueue = new Queue('media', { connection });
