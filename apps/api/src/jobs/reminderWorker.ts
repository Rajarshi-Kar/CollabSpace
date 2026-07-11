import { Worker, type Job } from 'bullmq';
import { prisma } from '../lib/prisma.js';
import { notify } from '../lib/notify.js';

interface ReminderJobData {
  taskId: string;
}

// Runs inside the API process rather than the worker service: it's a
// self-scheduled callback (tasks.routes.ts enqueues it, this consumes it)
// and needs current Postgres state to check the task wasn't completed or
// reassigned since the reminder was scheduled — the API already has that
// access, so there's no reason to duplicate a Prisma client into the
// worker just for this one queue.
async function processReminderJob(job: Job<ReminderJobData>) {
  const task = await prisma.task.findUnique({
    where: { id: job.data.taskId },
    include: { project: { include: { workspace: true } } },
  });
  if (!task || !task.assigneeId || task.status === 'DONE') return;

  await notify({
    userId: task.assigneeId,
    organizationId: task.project.workspace.organizationId,
    type: 'TASK_DUE_REMINDER',
    payload: { taskId: task.id, title: task.title, dueDate: task.dueDate },
  });
}

export function attachReminderWorker() {
  const connection = { url: process.env.REDIS_URL ?? 'redis://localhost:6379' } as never;
  const worker = new Worker('reminder', processReminderJob, { connection });
  worker.on('failed', (job, err) => {
    console.error(`[reminder] job ${job?.id} failed:`, err.message);
  });
  return worker;
}
