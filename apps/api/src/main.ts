import 'dotenv/config';
import { createServer } from 'node:http';
import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { authRouter } from './modules/auth/auth.routes.js';
import { orgsRouter } from './modules/orgs/orgs.routes.js';
import { activityRouter } from './modules/orgs/activity.routes.js';
import { notificationsRouter } from './modules/notifications/notifications.routes.js';
import { workspacesRouter } from './modules/workspaces/workspaces.routes.js';
import { teamsRouter } from './modules/teams/teams.routes.js';
import { documentsRouter } from './modules/documents/documents.routes.js';
import { versionsRouter } from './modules/documents/versions.routes.js';
import { commentsRouter } from './modules/documents/comments.routes.js';
import { projectsRouter } from './modules/projects/projects.routes.js';
import { tasksRouter } from './modules/tasks/tasks.routes.js';
import { channelsRouter } from './modules/messaging/channels.routes.js';
import { messagesRouter } from './modules/messaging/messages.routes.js';
import { foldersRouter } from './modules/files/folders.routes.js';
import { filesRouter } from './modules/files/files.routes.js';
import { searchRouter } from './modules/search/search.routes.js';
import { analyticsRouter } from './modules/analytics/analytics.routes.js';
import { authRateLimit, apiRateLimit } from './middleware/rateLimit.js';
import { createSocketServer } from './realtime/socket.js';
import { attachYjsServer } from './realtime/yjsServer.js';
import { attachReminderWorker } from './jobs/reminderWorker.js';

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173', credentials: true }));
app.use(cookieParser());
app.use(express.json());
app.use(apiRateLimit);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/auth', authRateLimit, authRouter);
app.use('/orgs', orgsRouter);
app.use('/orgs/:orgId/workspaces', workspacesRouter);
app.use('/orgs/:orgId/teams', teamsRouter);
app.use('/orgs/:orgId/activity', activityRouter);
app.use('/notifications', notificationsRouter);
app.use('/workspaces/:workspaceId/documents', documentsRouter);
app.use('/workspaces/:workspaceId/documents/:documentId/versions', versionsRouter);
app.use('/workspaces/:workspaceId/documents/:documentId/comments', commentsRouter);
app.use('/workspaces/:workspaceId/projects', projectsRouter);
app.use('/workspaces/:workspaceId/projects/:projectId/tasks', tasksRouter);
app.use('/workspaces/:workspaceId/channels', channelsRouter);
app.use('/workspaces/:workspaceId/channels/:channelId/messages', messagesRouter);
app.use('/workspaces/:workspaceId/folders', foldersRouter);
app.use('/workspaces/:workspaceId/files', filesRouter);
app.use('/workspaces/:workspaceId/search', searchRouter);
app.use('/workspaces/:workspaceId/analytics', analyticsRouter);

// Catches anything a route handler let throw synchronously or via a
// rejected promise Express 4 doesn't auto-forward, so a bug surfaces as a
// generic 500 instead of leaking a stack trace or hanging the request.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error('unhandled request error:', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal server error' });
};
app.use(errorHandler);

const httpServer = createServer(app);
createSocketServer(httpServer);
attachYjsServer(httpServer);
attachReminderWorker();

const port = Number(process.env.API_PORT ?? 4000);
httpServer.listen(port, () => {
  console.log(`api listening on :${port}`);
});

// Express 4 doesn't forward rejected promises from async route handlers to
// the error middleware above — routes here don't wrap themselves in
// try/catch + next(err), so without this a bug would surface as a hung
// request instead of a 500. This is a stopgap, not a fix: the real fix is
// either upgrading to Express 5 (auto-forwards) or wrapping every handler.
process.on('unhandledRejection', (reason) => {
  console.error('unhandled promise rejection in a route handler:', reason);
});
