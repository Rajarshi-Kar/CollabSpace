# CollabSpace

Production-inspired collaborative workspace platform (docs, tasks, chat, files, search) built to demonstrate real-time distributed systems engineering. See [problem_statement.md](./problem_statement.md) for the full brief and [CLAUDE.md](./CLAUDE.md) for the build roadmap.

## Stack

- **apps/web** — React + Vite + TS + Tailwind
- **apps/api** — Express + TS, REST + Socket.IO (Redis adapter), Prisma/Postgres
- **apps/worker** — BullMQ background jobs (email, search indexing)
- **packages/shared** — shared TS types/domain events

## Getting started

```bash
pnpm install
cp .env.example .env        # repeat inside apps/api if it needs its own .env
docker compose up -d        # Postgres, Redis, Meilisearch, MinIO
pnpm --filter @collabspace/api prisma:migrate
pnpm dev:api                # http://localhost:4000
pnpm dev:worker
pnpm dev:web                # http://localhost:5173
```

## Structure

```
apps/
  web/      React client
  api/      REST + WebSocket server
  worker/   BullMQ job processors
packages/
  shared/   shared types & domain events
```
