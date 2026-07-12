# CollabSpace

A unified team collaboration platform — real-time collaborative documents (Yjs CRDT), project management, team messaging, file storage, and full-text search — built to demonstrate distributed real-time systems engineering, not just CRUD. See [problem_statement.md](./problem_statement.md) for the full brief and [CLAUDE.md](./CLAUDE.md) for the phase-by-phase build log.

---

## Status

All 9 planned build phases (Phase 0 → Phase 9) are complete, plus a web app shell covering every backend domain. See [CLAUDE.md](./CLAUDE.md) for the detailed per-phase checklist.

| Phase | Scope | Status |
|---|---|---|
| 0 | Monorepo scaffold, Docker Compose, Prisma setup | Done |
| 1 | Auth (JWT), orgs/teams/workspaces, permission inheritance, audit log | Done |
| 2 | WebSocket gateway, Redis adapter, presence, domain-event bus | Done |
| 3 | Collaborative documents: Yjs CRDT sync, version history, comments, offline persistence | Done |
| 4 | Projects, tasks, Kanban ranking, milestones, sprints | Done |
| 5 | Channels, DMs, threads, reactions, typing indicators, read receipts | Done |
| 6 | Files: presigned S3/MinIO uploads, versioning, quotas, download history | Done |
| 7 | Meilisearch indexing pipeline, permission-filtered global search | Done |
| 8 | Notifications (in-app + email), task reminders, activity feed | Done |
| 9 | Workspace analytics, rate limiting, security headers, seed script | Done |
| — | Web app shell: routing, auth, a real page for every domain above | Done |

**Not done, and not pretending otherwise:** no automated test suite (0 tests — `vitest` is installed but unused), no CI pipeline, no Kanban drag-and-drop (a `<select>` calls the real `/move` endpoint instead), no cmd-K palette, no document version-history/comments UI, no load testing, no deployment config.

---

## Verified against live infra

Typechecking proves the code is internally consistent; it doesn't prove any of it actually works. This section is what was checked by running the real stack — Docker Compose (Postgres, Redis, Meilisearch, MinIO) plus all three Node services — and hitting it, not just reading the source.

**First live run surfaced two real bugs no amount of typechecking caught** (see commit `c312990`):
- Host port 5432 was already bound by a pre-existing native Postgres install on this machine, which silently intercepted connections instead of erroring — it presented as "wrong password," not "wrong server." Fixed by remapping the container to host port 5433.
- `GET /orgs/:id/workspaces` hung indefinitely. `Workspace.storageQuotaBytes` is a Postgres `BigInt`, and `JSON.stringify` throws on a native `bigint`. Because the throw happened inside an async route handler, Express 4 didn't forward it to the error middleware — the exact gap flagged (and deliberately left unfixed at the time) in the Phase 9 commit message. Fixed at the root with a `BigInt.prototype.toJSON` patch loaded before any route runs.

**End-to-end chain exercised live, via real HTTP requests against a running API, not mocks:**

| Step | Result |
|---|---|
| `POST /auth/signup` | Real JWT issued, user row created in Postgres |
| `POST /orgs` → `POST /orgs/:id/workspaces` | Org + workspace created, owner membership row correct |
| `POST /workspaces/:id/projects` → `.../tasks` | Project + task created, sequential task numbering correct |
| `POST /workspaces/:id/documents` | Document row created |
| `POST /workspaces/:id/channels` → `.../messages` | Channel + message created |
| `POST /workspaces/:id/files/upload-url` → `PUT` to MinIO → `.../complete` | Presigned upload succeeded; **downloaded bytes diffed byte-for-byte identical** to the original file |
| `GET /workspaces/:id/search?q=...` | Empty until the `worker` process was actually started (it wasn't running yet) — once started, a new document appeared in search results within 2 seconds via the real BullMQ → Meilisearch pipeline |
| Socket.IO connect → `room:join channel:<id>` → `POST` a message | Received a real `presence:update` event, then a real `domain-event` (`message.sent`) pushed through the Redis pub/sub bridge to a live client — confirmed the realtime path end-to-end, not just that the code compiles |

**Honest gap this surfaced:** the `worker` service is a separate process from `api` and is easy to forget to start — search silently returns empty results with no error if it isn't running, since the API enqueues the index job successfully either way. Worth a startup health check in a real deployment.

**Not yet verified live:** the Yjs WebSocket CRDT sync path (`/yjs/:documentId`) and multi-client concurrent editing — verified only by typecheck and manual browser use, not an automated or scripted check, since it needs two real WebSocket clients editing concurrently to prove conflict resolution actually works.

---

## Codebase statistics

| Metric | Count |
|---|---|
| API TypeScript files | 42 |
| API lines of code | ~3,640 |
| Worker TypeScript files | 5 |
| Worker lines of code | ~130 |
| Web TypeScript/TSX files | 22 |
| Web lines of code | ~1,470 |
| Prisma models | 32 |
| Prisma enums | 8 |
| Express routers | 14 |
| REST endpoints | 75 |
| Socket.IO event types | 5 (`room:join`, `room:leave`, `typing:start`, `typing:stop`, `disconnect`) + 2 server→client (`domain-event`, `notification`) |
| BullMQ queues | 4 (`email`, `index`, `media`, `reminder`) |
| Automated tests | 0 |
| Total tracked files | 109 |

---

## Architecture

```
React Client (Vite) ──REST──▶ Express API ──┬──▶ PostgreSQL (Prisma)
      │                          │           ├──▶ Redis (pub/sub, presence, rate limit)
      │                          │           ├──▶ MinIO/S3 (presigned upload/download)
      │                          │           └──▶ Meilisearch (indexed async)
      │
      ├──Socket.IO───▶ API realtime gateway ──▶ Redis adapter (horizontal scaling)
      │                    │
      │                    ├─ eventBridge: domain events → org/channel rooms
      │                    ├─ notificationBridge: per-user private rooms
      │                    └─ presence: who's online, per room
      │
      └──raw WebSocket──▶ /yjs/:documentId ──▶ y-protocols sync/awareness
                               │                (hand-rolled, no y-websocket server)
                               └──▶ Postgres (snapshot + incremental update log)

apps/worker (separate process) ◀──BullMQ (Redis)── apps/api
      ├─ email queue    (stub — logs instead of sending)
      ├─ index queue    (real: denormalized fields → Meilisearch)
      └─ media queue    (stub — no real thumbnailing yet)

apps/api (reminder queue is consumed in-process, not by the worker —
          it needs live Postgres reads to check a task wasn't already
          completed/reassigned since the reminder was scheduled)
```

One domain-event bus (`lib/events.ts`) feeds three things from a single call site: the audit log (→ activity feed), the realtime socket bridge, and the search-indexing queue — so a route handler never manually fans a mutation out to each of those separately.

---

## Key engineering decisions

- **CRDT (Yjs) over OT** for document conflict resolution — no server-side transform logic needed; every client converges by applying the same commutative update log, and the server is just another peer that happens to persist state.
- **Permission inheritance**: org role (OWNER/ADMIN/MEMBER/GUEST) sets a base access level per resource type; sparse `PermissionOverride` rows layer on top per user or team, per resource. Highest applicable level wins. No precomputed ACL table to keep in sync.
- **Presigned uploads**: the API issues short-lived S3 PUT/GET URLs and never proxies file bytes. Storage quota is checked twice — optimistically against the client-declared size before upload, then authoritatively against a real `HeadObject` size on `/complete` — closing the obvious "lie about the size" bypass.
- **Snapshot + update-log** for documents: Yjs updates append to a `DocumentUpdate` log; a debounced compaction merges them into a single `Document.snapshot` so cold-loads don't replay unbounded history.
- **Fractional-index Kanban ranking** (`lib/rank.ts`): a drag-and-drop move writes one row's rank string, not the whole column.
- **WebSocket horizontal scaling** via the Socket.IO Redis adapter — multiple API instances share room membership and pub/sub without a sticky-session requirement.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, React Router, Tailwind CSS, Zustand |
| Editor | TipTap + Yjs (CRDT) + y-websocket client provider + y-indexeddb (offline) |
| Backend | Express, TypeScript, Socket.IO (+ Redis adapter), raw `ws` for Yjs sync |
| Data | PostgreSQL (Prisma), Redis (pub/sub, presence, rate limiting), Meilisearch, MinIO (S3-compatible) |
| Async | BullMQ (email, search indexing, media, task reminders) |
| Security | JWT access/refresh, bcrypt, Helmet, Redis-backed rate limiting |
| Infra | Docker Compose, pnpm workspaces |

---

## Getting started

```bash
pnpm install
cp .env.example apps/api/.env     # and apps/worker/.env if it needs its own
docker compose up -d              # Postgres, Redis, Meilisearch, MinIO
pnpm --filter @collabspace/api prisma:migrate
pnpm --filter @collabspace/api seed   # optional demo org/workspace/project/data
pnpm dev:api                      # http://localhost:4000
pnpm dev:worker                   # required for search indexing and reminders to work
pnpm dev:web                      # http://localhost:5173
```

**Note:** `apps/worker` must be running for search results and background jobs to work — the API enqueues jobs successfully even if nothing is consuming them, so a missing worker fails silently rather than erroring.

## Structure

```
apps/
  web/      React client
  api/      REST + WebSocket server
  worker/   BullMQ job processors (search indexing, email, media)
packages/
  shared/   shared types & domain events
```
