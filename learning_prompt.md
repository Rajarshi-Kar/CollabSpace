I'm building CollabSpace, a collaborative workspace platform (like a mix of Notion, Jira, and Slack) as a learning project. I want you to teach me — the person who owns this repo — what it is and how it works in detail, not just summarize it.

Repo: https://github.com/Rajarshi-Kar/CollabSpace

Context on the project:

- It's a pnpm monorepo with four packages: `apps/web` (React + Vite + TypeScript + Tailwind), `apps/api` (Express + TypeScript, REST + Socket.IO with a Redis adapter, Prisma/PostgreSQL), `apps/worker` (BullMQ background job processors), and `packages/shared` (shared TypeScript types and domain events).
- Local dev infra is Docker Compose: Postgres, Redis, Meilisearch (search), and MinIO (S3-compatible file storage).
- The system is being built in phases: foundation/scaffolding, auth & multi-tenancy (organizations, teams, roles, workspaces, permission inheritance, invitations), real-time core (WebSocket rooms, Redis pub/sub fan-out), collaborative documents (Yjs CRDT + TipTap), project management (Kanban/tasks), messaging (channels/DMs), file storage, full-text search, notifications, and analytics.
- Full roadmap lives in `CLAUDE.md` in the repo root; the original requirements are in `problem_statement.md`.
- So far, Phase 0 (scaffolding) and most of Phase 1 (auth, orgs, teams, workspaces, permission-inheritance resolution service, invitation accept flow, audit logging via a shared domain-event emitter) are implemented and pushed to `main`.

What I want from you:

1. Clone or read through the repo and explain the actual architecture as it exists today — not the aspirational roadmap. Point me to specific files (e.g. `apps/api/src/modules/permissions/permissions.service.ts`) when you explain a mechanism.
2. Explain *why* each major technology choice was made and what problem it solves in this specific system: Prisma vs raw SQL, Socket.IO + Redis adapter for horizontal WebSocket scaling, BullMQ for async jobs, Meilisearch vs Elasticsearch, Yjs (CRDT) vs operational transforms for collaborative editing (even though Yjs isn't implemented yet, explain what's coming and why that choice was made in the roadmap).
3. Walk me through the permission model in detail: how org role (OWNER/ADMIN/MEMBER/GUEST) forms a base access level, how workspace-scoped `PermissionOverride` rows layer on top for specific users or teams, and how the resolver picks the highest applicable level. Use a concrete example (e.g. a GUEST with a MANAGE override on one document).
4. Explain the event-driven backbone: how `emitDomainEvent` writes an audit log row and publishes to Redis, and why that single choke point matters for future features (search indexing, realtime notifications) instead of scattering side effects across every route handler.
5. Where relevant, connect concepts back to fundamentals I should understand more deeply — e.g., what a CRDT actually guarantees vs OT, how JWT access/refresh token rotation works, how Redis pub/sub differs from a real message queue, and the tradeoffs of storing permission overrides as sparse rows vs precomputed ACLs.
6. Quiz me at the end with a few questions to check I actually understood the architecture, not just skimmed your explanation.

Keep the tone like a senior engineer pairing with me, not a marketing summary. Assume I can read TypeScript and Prisma schemas but want the reasoning made explicit.
