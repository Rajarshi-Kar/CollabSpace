# CollabSpace — Project Roadmap

Unified team collaboration platform (docs + tasks + chat + files + search) demonstrating real-time distributed systems engineering. See `problem_statement.md` for full requirements.

"D:\Desktop\Riju\KIIT\Projects\Project List.md" After completion, update this file to add the details of this project in the same format as the other projects, ok? and update the analysis

## Tech Stack (proposed)

- **Frontend:** React + TypeScript, Vite, TailwindCSS, Zustand/TanStack Query, TipTap (rich text) + Yjs (CRDT)
- **Backend:** Node.js + TypeScript (NestJS or Express), REST + WebSockets (Socket.IO / y-websocket) (Make a minimalistic UI with muted or off colors, don't make it look like typical AI slop websites with a bunch of purple and shit)
- **Data:** PostgreSQL (Prisma), Redis (pub/sub, presence, cache, rate limits), Meilisearch/Elasticsearch (search), S3-compatible storage (MinIO locally) for files
- **Async:** BullMQ workers (indexing, emails, notifications, exports, media processing)
- **Infra:** Docker Compose for dev; monorepo (pnpm workspaces: `apps/web`, `apps/api`, `apps/worker`, `packages/shared`)

## Phase 0 — Foundation

- [x] Monorepo scaffold, lint/format/tsconfig, Docker Compose (Postgres, Redis, Meilisearch, MinIO)
- [ ] CI (typecheck, lint, test) — not yet wired to GitHub Actions
- [x] Base schema design + Prisma setup, migration workflow

## Phase 1 — Auth & Multi-Tenancy

- [x] Auth: signup/login (JWT access + refresh) — password reset still open
- [x] Organizations, teams, members, invitations (email tokens)
- [x] Roles (owner/admin/member/guest); middleware for RBAC checks — permission groups beyond org roles not yet added
- [x] Workspaces within orgs; permission inheritance model (org → workspace → resource, with overrides)
- [x] Audit log table + event capture (emitDomainEvent)

## Phase 2 — Real-Time Core

- [x] WebSocket gateway (auth handshake, room model per workspace/doc/channel)
- [x] Redis pub/sub adapter so multiple API instances share socket state
- [x] Presence (who's online, per-room), reconnection/backoff handling
- [x] Event-bus abstraction: domain events → sockets + async workers

## Phase 3 — Collaborative Documents

- [x] TipTap editor + Yjs CRDT sync via a hand-rolled ws server (y-protocols sync/awareness) + y-websocket client provider; awareness (cursors, selections)
- [x] Persistence: Yjs updates snapshotted to Postgres; debounced snapshots + update log (`document-persistence.ts`)
- [x] Version history (manual + auto snapshots, restore-as-diff, text preview)
- [x] Nested pages tree (self-relation), document sharing via PermissionOverride, templates flag
- [x] Comments (anchored via JSON anchor field, threaded, resolve) — notifies the document creator and parent-comment author on new comments
- [x] Offline editing: IndexedDB persistence (y-indexeddb), merges automatically on reconnect via the CRDT
- [ ] Web app shell (routing, auth pages, workspace nav) still not built — CollaborativeEditor.tsx exists but isn't mounted into a real page yet

## Phase 4 — Project Management

- [x] Projects, tasks (status, priority, labels, assignees, deadlines, dependencies)
- [x] Kanban board backend: fractional-rank reorder endpoint (`/tasks/:id/move`) for drag-and-drop without rewriting whole columns — web board UI not built yet
- [x] Milestones, sprints (create + status transitions); no dedicated planning-view UI yet
- [ ] Task activity history (audit log captures task.created/task.updated but no per-task timeline view); task ↔ document linking is in the schema (`Task.documentId`) and wired

## Phase 5 — Messaging

- [x] Channels (public/private) + DMs (modeled as 2-member private channels); message persistence with cursor pagination (`before` message-id cursor)
- [x] Real-time delivery routed to `channel:<id>` rooms, not the whole org (private channels/DMs would otherwise leak); threads (parentId), reactions, pinned messages
- [x] Typing indicators (pure ephemeral socket fan-out, not persisted); read receipts via per-member `lastReadAt` watermark
- [x] Mentions parsed from message body (`@<userId>` → `mentionedUserIds`) and notify each mentioned user; file attachments in messages via `MessageAttachment` (added in Phase 6)

## Phase 6 — Files

- [x] Folder hierarchy (self-relation); uploads via presigned S3/MinIO PUT URLs (client uploads directly, server never proxies bytes) — multipart for very large files not yet added
- [x] File versioning (File = stable identity, FileVersion = actual bytes + storage key); download history (`FileDownload` row per download); preview generation deferred to the media worker job (stub only — no real thumbnailing yet)
- [x] Storage quotas per workspace, enforced twice: optimistically on upload-url request (client-declared size) and authoritatively on /complete via S3 HeadObject (real size) — rejects and cleans up if the real upload would exceed quota; async media-processing queue wired (worker job is still a stub, no real thumbnail generation)

## Phase 7 — Search

- [x] Meilisearch indexes: documents (title + Yjs-extracted plain text), tasks, messages, files, people (org-scoped, not workspace-scoped)
- [x] Async indexing pipeline: API denormalizes searchable fields and enqueues onto the existing BullMQ `index` queue at write time (create/update/delete) — worker never re-queries Postgres, just upserts/deletes in Meilisearch; results are permission-filtered post-query (over-fetch + per-hit `resolvePermission`/channel-membership check) since Meilisearch has no per-user ACL concept
- [ ] Global search UI (cmd-K), filters, tag search, recent searches — backend endpoints exist (`GET /workspaces/:id/search`, `/search/people`), no web UI yet

## Phase 8 — Notifications & Activity

- [x] Notification service: in-app (real-time via a per-user `user:<id>` socket room + Redis pub/sub bridge), email immediate-send wired (via existing `email` queue); digest batching not yet implemented (needs a scheduled job, not a per-notification one)
- [x] Preferences per user (muted types, digest/immediate toggle); mention alerts (chat + doc comments), task assignment alerts, task due-date reminders (delayed BullMQ job, consumed in-process by the API since it needs live Postgres state — not the worker)
- [x] Activity feed — org-scoped (not per-workspace/project yet; audit log has no workspaceId column, would need a join through targetId per targetType), reads directly off the existing `AuditLog` table rather than a separate model

## Phase 9 — Analytics & Polish

- [x] Workspace analytics (`GET /workspaces/:id/analytics`): per-project task completion/overdue, workspace-wide completion rate, storage usage, active-user count, document/channel counts — computed on read, no counter tables to drift
- [x] Rate limiting (Redis-backed, shared across API instances — auth endpoints tighter than general API); helmet security headers; global error handler — **known gap**: Express 4 doesn't forward async route-handler rejections to it, so a thrown error in a route currently hangs the request rather than 500ing (stopgap `unhandledRejection` logger added; real fix is Express 5 or wrapping every handler)
- [ ] Load testing (WebSocket fan-out, concurrent editing), graceful degradation — not done, needs live infra
- [x] Seed script (`pnpm --filter @collabspace/api seed`) — demo org/workspace/project/tasks/document/channel; deployment config and demo script still open

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
