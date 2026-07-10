import 'dotenv/config';
import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { authRouter } from './modules/auth/auth.routes.js';
import { orgsRouter } from './modules/orgs/orgs.routes.js';
import { workspacesRouter } from './modules/workspaces/workspaces.routes.js';
import { teamsRouter } from './modules/teams/teams.routes.js';
import { createSocketServer } from './realtime/socket.js';

const app = express();
app.use(cors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173', credentials: true }));
app.use(cookieParser());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/auth', authRouter);
app.use('/orgs', orgsRouter);
app.use('/orgs/:orgId/workspaces', workspacesRouter);
app.use('/orgs/:orgId/teams', teamsRouter);

const httpServer = createServer(app);
createSocketServer(httpServer);

const port = Number(process.env.API_PORT ?? 4000);
httpServer.listen(port, () => {
  console.log(`api listening on :${port}`);
});
