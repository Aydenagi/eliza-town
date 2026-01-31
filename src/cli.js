#!/usr/bin/env node
// Eliza Town CLI - Local terminal interface for agent interaction
// Usage: node src/cli.js [--server http://localhost:3000]

import readline from 'readline';

const SERVER = process.argv.includes('--server')
  ? process.argv[process.argv.indexOf('--server') + 1]
  : process.env.ELIZA_SERVER || 'http://localhost:3000';

const SESSION_ID = `cli_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

// ANSI colors
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m'
};

const AGENT_COLORS = {
  planner: C.magenta,
  designer: C.magenta,
  coder: C.blue,
  reviewer: C.green,
  claude: C.yellow
};

function colorize(text, color) {
  return `${color}${text}${C.reset}`;
}

function printBanner() {
  console.log(colorize(`
  ╔═══════════════════════════════════════╗
  ║         🏰 ELIZA TOWN CLI 🏰         ║
  ║   Local Agent Interaction Terminal    ║
  ╚═══════════════════════════════════════╝`, C.cyan));
  console.log(colorize(`  Server: ${SERVER}`, C.dim));
  console.log(colorize(`  Session: ${SESSION_ID}`, C.dim));
  console.log();
  console.log(`  Commands:`);
  console.log(`    ${colorize('/agents', C.yellow)}     - List all agents`);
  console.log(`    ${colorize('/tasks', C.yellow)}      - List tasks`);
  console.log(`    ${colorize('/task <desc>', C.yellow)} - Create a new task`);
  console.log(`    ${colorize('/status', C.yellow)}     - Server health status`);
  console.log(`    ${colorize('/channels', C.yellow)}   - Connected messaging channels`);
  console.log(`    ${colorize('/schedule', C.yellow)}   - View scheduled tasks`);
  console.log(`    ${colorize('/help', C.yellow)}       - Show this help`);
  console.log(`    ${colorize('/quit', C.yellow)}       - Exit`);
  console.log(`    ${colorize('(anything else)', C.gray)} - Chat with agents`);
  console.log();
}

async function apiCall(path, options = {}) {
  try {
    const url = `${SERVER}/api${path}`;
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (error) {
    return { error: error.message };
  }
}

async function listAgents() {
  const data = await apiCall('/agents');
  if (data.error) {
    console.log(colorize(`  Error: ${data.error}`, C.red));
    return;
  }
  if (!Array.isArray(data)) {
    console.log(colorize('  No agents available (DB may not be connected)', C.dim));
    return;
  }

  console.log(colorize('\n  Agents:', C.bold));
  for (const agent of data) {
    const color = AGENT_COLORS[agent.type] || C.white;
    const statusIcon = agent.status === 'idle' ? '💤' : agent.status === 'working' ? '⚡' : '🚶';
    console.log(`  ${statusIcon} ${colorize(agent.name, color)} (${agent.type}) - ${agent.status}`);
  }
  console.log();
}

async function listTasks() {
  const data = await apiCall(`/tasks?sessionId=${SESSION_ID}`);
  if (data.error) {
    console.log(colorize(`  Error: ${data.error}`, C.red));
    return;
  }
  if (!Array.isArray(data) || data.length === 0) {
    console.log(colorize('  No tasks in this session', C.dim));
    return;
  }

  console.log(colorize('\n  Tasks:', C.bold));
  for (const task of data) {
    const icon = task.status === 'completed' ? '✅' : task.status === 'in_progress' ? '🔄' : '⏳';
    console.log(`  ${icon} [${task.status}] ${task.title}`);
  }
  console.log();
}

async function createTask(description) {
  const data = await apiCall('/tasks', {
    method: 'POST',
    body: JSON.stringify({
      title: description.substring(0, 100),
      description,
      priority: 5,
      sessionId: SESSION_ID
    })
  });

  if (data.error) {
    console.log(colorize(`  Error: ${data.error}`, C.red));
    return;
  }

  console.log(colorize(`  ✅ Task created: "${data.title}"`, C.green));
  console.log(colorize(`     ID: ${data.id} | Priority: ${data.priority}`, C.dim));
  console.log();
}

async function checkStatus() {
  const data = await apiCall('/health');
  if (data.error) {
    console.log(colorize(`  ❌ Server unreachable: ${data.error}`, C.red));
    return;
  }

  console.log(colorize('\n  Server Status:', C.bold));
  console.log(`  Status: ${data.status === 'ok' ? colorize('OK', C.green) : colorize('ERROR', C.red)}`);
  console.log(`  DB: ${data.dbAvailable ? colorize('Connected', C.green) : colorize('Not connected', C.red)}`);
  console.log(`  Orchestration: ${data.orchestrationReady ? colorize('Running', C.green) : colorize('Stopped', C.yellow)}`);
  console.log(`  WebSocket: ${data.wsInitialized ? colorize('Ready', C.green) : colorize('Not ready', C.red)}`);
  console.log(`  API Key: ${data.hasApiKey ? colorize('Configured', C.green) : colorize('Not set (simulation mode)', C.yellow)}`);
  console.log();
}

async function checkChannels() {
  const data = await apiCall('/channels/status');
  if (data.error) {
    console.log(colorize('  No channel data available', C.dim));
    return;
  }

  console.log(colorize('\n  Connected Channels:', C.bold));
  if (data.channels && Object.keys(data.channels).length > 0) {
    for (const [name, info] of Object.entries(data.channels)) {
      const icon = info.connected ? '🟢' : '🔴';
      console.log(`  ${icon} ${name} ${info.botUser ? `(${info.botUser})` : ''}`);
    }
  } else {
    console.log(colorize('  No channels connected', C.dim));
  }
  console.log(`  Queue: ${data.queueLength || 0} messages pending`);
  console.log();
}

async function checkSchedule() {
  const data = await apiCall('/proactive/status');
  if (data.error) {
    console.log(colorize('  No schedule data available', C.dim));
    return;
  }

  console.log(colorize('\n  Scheduled Tasks:', C.bold));
  if (data.scheduledTasks && data.scheduledTasks.length > 0) {
    for (const t of data.scheduledTasks) {
      const nextIn = Math.max(0, Math.round((t.nextRun - Date.now()) / 1000));
      console.log(`  ⏰ ${t.name} - every ${t.intervalMs / 1000}s (next in ${nextIn}s, ran ${t.runCount}x)`);
    }
  } else {
    console.log(colorize('  No scheduled tasks', C.dim));
  }

  if (data.watchers && data.watchers.length > 0) {
    console.log(colorize('\n  Watchers:', C.bold));
    for (const w of data.watchers) {
      console.log(`  👁️  ${w.name} - ${w.triggered ? 'TRIGGERED' : 'watching'}`);
    }
  }
  console.log();
}

async function chatWithAgents(message) {
  process.stdout.write(colorize('  Thinking...', C.dim));

  const data = await apiCall('/chat', {
    method: 'POST',
    body: JSON.stringify({ message, sessionId: SESSION_ID })
  });

  // Clear "Thinking..."
  process.stdout.write('\r\x1b[K');

  if (data.error) {
    console.log(colorize(`  Error: ${data.error}`, C.red));
    return;
  }

  if (Array.isArray(data)) {
    for (const response of data) {
      if (response.response && response.response.trim()) {
        const color = AGENT_COLORS[response.agentType] || C.white;
        console.log();
        console.log(`  ${colorize(`[${response.agentName}]`, color)} ${response.response}`);
      }
    }
  } else if (data.response) {
    console.log(`  ${data.response}`);
  }
  console.log();
}

// === WEBSOCKET LISTENER (background notifications) ===

let ws = null;

function connectWebSocket() {
  try {
    const wsUrl = SERVER.replace('http', 'ws') + '/ws';
    const WebSocket = globalThis.WebSocket || (await import('ws')).default;
    ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'register_session', sessionId: SESSION_ID }));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'proactive_notification') {
          console.log(colorize(`\n  📢 ${msg.data.message}`, C.yellow));
          rl.prompt();
        } else if (msg.type === 'task_complete') {
          console.log(colorize(`\n  ✅ Task completed!`, C.green));
          rl.prompt();
        }
      } catch (e) { /* ignore parse errors */ }
    });

    ws.on('error', () => { /* silently reconnect */ });
    ws.on('close', () => {
      setTimeout(connectWebSocket, 5000);
    });
  } catch (e) {
    // WebSocket not available in this environment
  }
}

// === MAIN REPL ===

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: colorize('eliza> ', C.cyan)
});

printBanner();

// Try to connect WebSocket for notifications
try {
  connectWebSocket();
} catch (e) { /* optional */ }

rl.prompt();

rl.on('line', async (line) => {
  const input = line.trim();

  if (!input) {
    rl.prompt();
    return;
  }

  if (input === '/quit' || input === '/exit' || input === '/q') {
    console.log(colorize('\n  Farewell from Eliza Town! 🏰\n', C.cyan));
    if (ws) ws.close();
    process.exit(0);
  }

  if (input === '/help') {
    printBanner();
  } else if (input === '/agents') {
    await listAgents();
  } else if (input === '/tasks') {
    await listTasks();
  } else if (input.startsWith('/task ')) {
    await createTask(input.substring(6));
  } else if (input === '/status') {
    await checkStatus();
  } else if (input === '/channels') {
    await checkChannels();
  } else if (input === '/schedule') {
    await checkSchedule();
  } else {
    await chatWithAgents(input);
  }

  rl.prompt();
});

rl.on('close', () => {
  if (ws) ws.close();
  process.exit(0);
});
