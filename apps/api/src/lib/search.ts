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
