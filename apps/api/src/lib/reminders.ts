import { reminderQueue } from './queues.js';

const REMINDER_LEAD_MS = 24 * 60 * 60 * 1000; // notify 24h before a task is due

function reminderJobId(taskId: string): string {
  return `task-due:${taskId}`;
}

/**
 * (Re)schedules a due-date reminder as a delayed BullMQ job. Called on task
 * create/update whenever dueDate or assigneeId changes; always removes any
 * existing scheduled reminder first so edits don't leave a stale delayed job
 * pointing at the old due date or assignee.
 */
export async function scheduleTaskReminder(taskId: string, dueDate: Date | null) {
  await cancelTaskReminder(taskId);
  if (!dueDate) return;

  const fireAt = dueDate.getTime() - REMINDER_LEAD_MS;
  const delay = Math.max(fireAt - Date.now(), 0);

  await reminderQueue.add(
    'task-due',
    { taskId },
    { jobId: reminderJobId(taskId), delay },
  );
}

export async function cancelTaskReminder(taskId: string) {
  const job = await reminderQueue.getJob(reminderJobId(taskId));
  if (job) await job.remove().catch(() => undefined);
}
