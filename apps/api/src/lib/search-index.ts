import type { SearchIndexJob } from '@collabspace/shared';
import { indexQueue } from './queues.js';

export function enqueueIndex(job: SearchIndexJob) {
  return indexQueue.add('index', job);
}
