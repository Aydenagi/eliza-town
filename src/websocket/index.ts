import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';

// Kept for src/eliza/* (ENGINE=eliza), which still builds frames as one object.
export interface WebSocketMessage {
  type: string;
  data?: Record<string, unknown>;
  timestamp?: number;
}

let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();

export type StateSnapshotProvider = () => Record<string, unknown>;

let stateSnapshotProvider: StateSnapshotProvider | null = null;

export function setStateSnapshotProvider(provider: StateSnapshotProvider): void {
  stateSnapshotProvider = provider;
}

export function initialize(server: Server): void {
  wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(request.url || '/', `http://${request.headers.host}`);
    if (url.pathname === '/ws') {
      wss!.handleUpgrade(request, socket, head, (ws: WebSocket) => {
        wss!.emit('connection', ws);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws: WebSocket) => {
    clients.add(ws);

    ws.on('message', (raw: Buffer) => {
      let message: { type?: string };
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (message.type === 'ping') {
        send(ws, 'pong', {});
      }
    });

    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));

    send(ws, 'connected', { message: 'Welcome to Eliza Town' });
    if (stateSnapshotProvider) {
      send(ws, 'state_update', stateSnapshotProvider());
    }
  });

  console.log('WebSocket server initialized');
}

function send(ws: WebSocket, type: string, data: Record<string, unknown>): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify({ type, data, timestamp: Date.now() }));
  } catch {
    clients.delete(ws);
  }
}

export function broadcast(type: string, data: Record<string, unknown>): void {
  const payload = JSON.stringify({ type, data, timestamp: Date.now() });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(payload);
      } catch {
        clients.delete(client);
      }
    }
  }
}

export function clientCount(): number {
  return clients.size;
}
