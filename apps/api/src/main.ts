import 'dotenv/config';
import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { authRouter } from './modules/auth/auth.routes.js';
import { orgsRouter } from './modules/orgs/orgs.routes.js';
import { workspacesRouter } from './modules/workspaces/workspaces.routes.js';
import { teamsRouter } from './modules/teams/teams.routes.js';
import { documentsRouter } from './modules/documents/documents.routes.js';
import { versionsRouter } from './modules/documents/versions.routes.js';
import { commentsRouter } from './modules/documents/comments.routes.js';
import { projectsRouter } from './modules/projects/projects.routes.js';
import { tasksRouter } from './modules/tasks/tasks.routes.js';
import { createSocketServer } from './realtime/socket.js';
import { attachYjsServer } from './realtime/yjsServer.js';

const app = express();
app.use(cors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173', credentials: true }));
app.use(cookieParser());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/auth', authRouter);
app.use('/orgs', orgsRouter);
app.use('/orgs/:orgId/workspaces', workspacesRouter);
app.use('/orgs/:orgId/teams', teamsRouter);
app.use('/workspaces/:workspaceId/documents', documentsRouter);
app.use('/workspaces/:workspaceId/documents/:documentId/versions', versionsRouter);
app.use('/workspaces/:workspaceId/documents/:documentId/comments', commentsRouter);
app.use('/workspaces/:workspaceId/projects', projectsRouter);
app.use('/workspaces/:workspaceId/projects/:projectId/tasks', tasksRouter);

const httpServer = createServer(app);
createSocketServer(httpServer);
attachYjsServer(httpServer);

const port = Number(process.env.API_PORT ?? 4000);
httpServer.listen(port, () => {
  console.log(`api listening on :${port}`);
});
