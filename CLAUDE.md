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
- [x] Comments (anchored via JSON anchor field, threaded, resolve) — @mentions parsing not yet wired to notifications (Phase 8)
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
- [x] Mentions parsed from message body (`@<userId>` → `mentionedUserIds`) — not yet wired to notification delivery (Phase 8); file attachments in messages deferred to Phase 6 (needs the File model first)

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
