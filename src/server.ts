import cors from 'cors';
import express from 'express';
import fs from 'fs';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

try {
  await import('dotenv/config');
} catch {
  // No dotenv installed or no .env file. Fine outside local dev.
}

const { config } = await import('./config.js');
const { createApiRouter } = await import('./api/routes.js');
const ws = await import('./websocket/index.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const app = express();
const server = createServer(app);

// Behind Render's proxy req.ip is the proxy unless this is set, which would make the
// per-IP task rate limit global.
if (process.env.NODE_ENV === 'production') app.set('trust proxy', true);

app.use(cors());
app.use(express.json({ limit: '2mb' }));

const clientDistPath = path.join(rootDir, 'dist', 'client');
const hasBuiltClient = fs.existsSync(clientDistPath);
if (hasBuiltClient) {
  app.use(express.static(clientDistPath));
}

app.use(
  '/assets',
  express.static(path.join(rootDir, 'assets'), {
    setHeaders: (res, filepath) => {
      if (filepath.endsWith('.gltf')) res.setHeader('Content-Type', 'model/gltf+json');
      else if (filepath.endsWith('.glb')) res.setHeader('Content-Type', 'model/gltf-binary');
      else if (filepath.endsWith('.bin')) res.setHeader('Content-Type', 'application/octet-stream');
    },
  })
);

ws.initialize(server);

async function boot(): Promise<void> {
  if (config.engine === 'eliza') {
    const eliza = await import('./engine/eliza.js');
    await eliza.startElizaEngine();

    app.use(
      '/api',
      createApiRouter({
        listAgents: eliza.listAgentsEliza,
        getAgent: eliza.getAgentEliza,
        updateAgent: eliza.updateAgentEliza,
        listTasks: eliza.listTasksEliza,
        getTask: eliza.getTaskEliza,
        createTask: eliza.createTaskEliza,
        queueLength: eliza.queueLengthEliza,
        health: eliza.healthInfoEliza,
        recentMessages: eliza.recentMessagesEliza,
      })
    );

    process.on('SIGINT', () => shutdown(eliza.stopElizaEngine));
    process.on('SIGTERM', () => shutdown(eliza.stopElizaEngine));
  } else {
    const orchestrator = await import('./engine/orchestrator.js');
    await orchestrator.init();

    app.use(
      '/api',
      createApiRouter({
        listAgents: orchestrator.listAgentsWire,
        getAgent: orchestrator.getAgentWire,
        updateAgent: orchestrator.updateAgentProfile,
        listTasks: orchestrator.listTasksWire,
        getTask: orchestrator.getTaskWire,
        createTask: orchestrator.createTask,
        queueLength: orchestrator.queueLength,
        health: orchestrator.healthInfo,
        recentMessages: orchestrator.recentMessages,
      })
    );

    process.on('SIGINT', () => shutdown(orchestrator.shutdown));
    process.on('SIGTERM', () => shutdown(orchestrator.shutdown));
  }

  app.get(/^(?!\/api|\/ws).*/, (_req, res) => {
    if (hasBuiltClient) {
      res.sendFile(path.join(clientDistPath, 'index.html'));
    } else {
      res.status(503).send('Client not built. Run "npm run build" or start the client dev server separately.');
    }
  });

  server.once('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${config.port} is already in use. Set PORT to a free port and try again.`);
    } else {
      console.error('Failed to start server:', error.message);
    }
    process.exit(1);
  });

  server.listen(config.port, () => {
    console.log(`Eliza Town server listening on port ${config.port} (engine: ${config.engine})`);
  });
}

let shuttingDown = false;
function shutdown(stopEngine: () => void): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('Shutting down...');
  stopEngine();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('uncaughtException', (error: Error) => {
  console.error('Uncaught exception:', error);
});
process.on('unhandledRejection', (reason: unknown) => {
  console.error('Unhandled rejection:', reason);
});

boot().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
