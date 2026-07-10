I've started building CollabSpace, a collaborative workspace platform that brings together documents, project management, team messaging, file sharing, and search into one system — the kind of tool teams usually stitch together from Notion, Jira, Slack, and Drive.

The goal isn't to compete with those products. It's to work through the engineering problems that real-time collaboration systems have to solve: syncing concurrent edits between clients, permission inheritance across organizations and workspaces, scaling WebSocket connections horizontally, keeping search indexes current, and structuring a backend so that a single action (like updating a document) can trigger real-time updates, search indexing, and notifications without duplicating logic everywhere.

It's a TypeScript monorepo — React on the frontend, Express and Socket.IO on the backend, Postgres via Prisma, Redis for pub/sub and presence, Meilisearch for search, and BullMQ for background jobs. Multi-tenant auth and permissions are in place now; real-time document editing, task boards, messaging, and search are next.

Repo: github.com/Rajarshi-Kar/CollabSpace
