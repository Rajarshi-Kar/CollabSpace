# CollabSpace — Project Roadmap

Unified team collaboration platform (docs + tasks + chat + files + search) demonstrating real-time distributed systems engineering. See `problem_statement.md` for full requirements.

## Tech Stack (proposed)

- **Frontend:** React + TypeScript, Vite, TailwindCSS, Zustand/TanStack Query, TipTap (rich text) + Yjs (CRDT)
- **Backend:** Node.js + TypeScript (NestJS or Express), REST + WebSockets (Socket.IO / y-websocket)
- **Data:** PostgreSQL (Prisma), Redis (pub/sub, presence, cache, rate limits), Meilisearch/Elasticsearch (search), S3-compatible storage (MinIO locally) for files
- **Async:** BullMQ workers (indexing, emails, notifications, exports, media processing)
- **Infra:** Docker Compose for dev; monorepo (pnpm workspaces: `apps/web`, `apps/api`, `apps/worker`, `packages/shared`)

## Phase 0 — Foundation

- [ ] Monorepo scaffold, lint/format/tsconfig, Docker Compose (Postgres, Redis, Meilisearch, MinIO)
- [ ] CI (typecheck, lint, test), env config, shared types package
- [ ] Base schema design + Prisma setup, migration workflow

## Phase 1 — Auth & Multi-Tenancy

- [ ] Auth: signup/login (JWT access + refresh, httpOnly cookies), password reset
- [ ] Organizations, teams, members, invitations (email tokens)
- [ ] Roles (owner/admin/member/guest) + permission groups; middleware for RBAC checks
- [ ] Workspaces within orgs; permission inheritance model (org → workspace → resource, with overrides)
- [ ] Audit log table + event capture middleware

## Phase 2 — Real-Time Core

- [ ] WebSocket gateway (auth handshake, room model per workspace/doc/channel)
- [ ] Redis pub/sub adapter so multiple API instances share socket state
- [ ] Presence (who's online, per-room), reconnection/backoff handling
- [ ] Event-bus abstraction: domain events → sockets + async workers

## Phase 3 — Collaborative Documents

- [ ] TipTap editor + Yjs CRDT sync via y-websocket provider; awareness (cursors, selections)
- [ ] Persistence: Yjs updates snapshotted to Postgres; debounced snapshots + update log
- [ ] Version history (periodic snapshots, restore, diff view)
- [ ] Nested pages tree, document sharing/permissions, templates
- [ ] Comments (anchored to ranges), @mentions → notification events
- [ ] Offline editing: IndexedDB persistence (y-indexeddb), merge on reconnect

## Phase 4 — Project Management

- [ ] Projects, tasks (status, priority, labels, assignees, deadlines, dependencies)
- [ ] Kanban board (drag-and-drop, optimistic updates, real-time sync of moves) + list view
- [ ] Milestones, sprints (planning view, sprint scoping)
- [ ] Task activity history; task ↔ document linking

## Phase 5 — Messaging

- [ ] Channels (public/private) + DMs; message persistence with cursor pagination
- [ ] Real-time delivery, threads, reactions, pinned messages
- [ ] Typing indicators + read receipts (Redis-backed, ephemeral)
- [ ] Mentions in chat, file attachments in messages

## Phase 6 — Files

- [ ] Folder hierarchy, drag-and-drop uploads (presigned URLs, multipart for large files)
- [ ] File versioning, preview (images/PDF), download history
- [ ] Storage quotas per org; async media processing (thumbnails)

## Phase 7 — Search

- [ ] Meilisearch indexes: documents, tasks, messages, files, people
- [ ] Async indexing pipeline via worker (on domain events); permission-filtered results
- [ ] Global search UI (cmd-K), filters, tag search, recent searches

## Phase 8 — Notifications & Activity

- [ ] Notification service: in-app (real-time via sockets), email (digest + immediate) via worker
- [ ] Preferences per user; mention alerts, task reminders (scheduled jobs), comment notifications
- [ ] Activity feed per workspace/project

## Phase 9 — Analytics & Polish

- [ ] Workspace analytics: project progress, task completion, team/document activity, storage usage, engagement
- [ ] Rate limiting, input validation hardening, security review (multi-tenant isolation tests)
- [ ] Load testing (WebSocket fan-out, concurrent editing), graceful degradation
- [ ] Docs, seed data, demo script, deployment config

## Key Engineering Decisions to Document as Built

- CRDT (Yjs) over OT for conflict resolution — why and trade-offs
- Permission inheritance resolution algorithm and caching strategy
- Event-driven architecture: single event bus feeding sockets, search indexing, notifications, audit log
- WebSocket horizontal scaling via Redis adapter
- Snapshot + update-log strategy for document history vs storage cost

## Conventions

- All timestamps UTC; IDs are UUIDv7
- Every mutation emits a domain event (audit + realtime + indexing derive from it)
- Permission checks server-side on every request/socket event; never trust client
