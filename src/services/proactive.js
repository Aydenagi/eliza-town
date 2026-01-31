// Proactive agent system - OpenClaw-inspired scheduled tasks & notifications
// Agents can schedule actions, reminders, and monitor conditions

import * as db from '../db/index.js';
import * as claude from '../agents/claude.js';
import { broadcast } from '../websocket/index.js';

// Scheduled items
const scheduledTasks = new Map(); // id -> { cron, nextRun, action, ... }
const watchers = new Map(); // id -> { condition, action, interval, ... }
let schedulerInterval = null;
let nextId = 1;

// === SCHEDULED TASKS ===

export function scheduleTask({ name, intervalMs, action, agentId, sessionId, runImmediately = false }) {
  const id = `sched_${nextId++}`;
  const task = {
    id,
    name,
    intervalMs,
    action,
    agentId,
    sessionId,
    nextRun: runImmediately ? Date.now() : Date.now() + intervalMs,
    createdAt: Date.now(),
    runCount: 0,
    lastResult: null,
    active: true
  };

  scheduledTasks.set(id, task);
  console.log(`Scheduled task: "${name}" every ${intervalMs / 1000}s`);

  broadcast({
    type: 'schedule_created',
    data: { id, name, intervalMs, agentId }
  });

  return task;
}

export function cancelScheduledTask(id) {
  const task = scheduledTasks.get(id);
  if (task) {
    task.active = false;
    scheduledTasks.delete(id);
    return true;
  }
  return false;
}

// === WATCHERS (condition-based triggers) ===

export function addWatcher({ name, checkFn, action, intervalMs = 30000, agentId, sessionId }) {
  const id = `watch_${nextId++}`;
  const watcher = {
    id,
    name,
    checkFn,
    action,
    intervalMs,
    agentId,
    sessionId,
    lastCheck: 0,
    triggered: false,
    createdAt: Date.now()
  };

  watchers.set(id, watcher);
  console.log(`Watcher added: "${name}"`);
  return watcher;
}

export function removeWatcher(id) {
  return watchers.delete(id);
}

// === BUILT-IN PROACTIVE BEHAVIORS ===

function registerBuiltInBehaviors() {
  // Daily summary - every 4 hours, generate a town status summary
  scheduleTask({
    name: 'Town Status Summary',
    intervalMs: 4 * 60 * 60 * 1000, // 4 hours
    action: async () => {
      try {
        const agents = await db.getAgents();
        const tasks = await db.getTasks();
        const pending = tasks.filter(t => t.status === 'pending').length;
        const inProgress = tasks.filter(t => t.status === 'in_progress').length;
        const completed = tasks.filter(t => t.status === 'completed').length;

        const summary = `Town Status: ${agents.length} agents active, ${pending} pending / ${inProgress} in progress / ${completed} completed tasks`;

        broadcast({
          type: 'proactive_notification',
          data: {
            type: 'summary',
            message: summary,
            timestamp: Date.now()
          }
        });

        return summary;
      } catch (err) {
        console.error('Status summary error:', err.message);
        return null;
      }
    }
  });

  // Idle agent check - every 5 minutes, suggest work for idle agents
  scheduleTask({
    name: 'Idle Agent Suggestions',
    intervalMs: 5 * 60 * 1000, // 5 minutes
    action: async () => {
      try {
        const agents = await db.getAgents();
        const idleAgents = agents.filter(a => a.status === 'idle');

        if (idleAgents.length > 3) {
          const names = idleAgents.map(a => a.name).join(', ');

          broadcast({
            type: 'proactive_notification',
            data: {
              type: 'idle_agents',
              message: `${idleAgents.length} agents are idle (${names}). Consider creating tasks for them!`,
              agentCount: idleAgents.length,
              timestamp: Date.now()
            }
          });
        }

        return { idleCount: idleAgents.length };
      } catch (err) {
        console.error('Idle check error:', err.message);
        return null;
      }
    }
  });

  // Task completion notifier - every 30s, check for newly completed tasks
  scheduleTask({
    name: 'Completion Notifier',
    intervalMs: 30 * 1000,
    action: async () => {
      try {
        const messages = await db.getRecentMessages(10);
        const completions = messages.filter(
          m => m.type === 'announcement' && m.content.includes('completed') &&
            (Date.now() - new Date(m.created_at).getTime()) < 35000
        );

        for (const msg of completions) {
          broadcast({
            type: 'proactive_notification',
            data: {
              type: 'task_completed',
              message: msg.content,
              agentId: msg.agent_id,
              timestamp: Date.now()
            }
          });
        }

        return { notified: completions.length };
      } catch (err) {
        return null;
      }
    }
  });
}

// === SCHEDULER LOOP ===

async function runScheduler() {
  const now = Date.now();

  // Process scheduled tasks
  for (const [id, task] of scheduledTasks) {
    if (!task.active || now < task.nextRun) continue;

    try {
      task.lastResult = await task.action();
      task.runCount++;
      task.nextRun = now + task.intervalMs;
    } catch (error) {
      console.error(`Scheduled task "${task.name}" error:`, error.message);
      task.lastResult = { error: error.message };
      task.nextRun = now + task.intervalMs;
    }
  }

  // Process watchers
  for (const [id, watcher] of watchers) {
    if (now - watcher.lastCheck < watcher.intervalMs) continue;
    watcher.lastCheck = now;

    try {
      const shouldTrigger = await watcher.checkFn();
      if (shouldTrigger && !watcher.triggered) {
        watcher.triggered = true;
        await watcher.action();

        broadcast({
          type: 'watcher_triggered',
          data: { id: watcher.id, name: watcher.name, timestamp: now }
        });
      } else if (!shouldTrigger) {
        watcher.triggered = false;
      }
    } catch (error) {
      console.error(`Watcher "${watcher.name}" error:`, error.message);
    }
  }
}

// === LIFECYCLE ===

export function initialize() {
  registerBuiltInBehaviors();
  schedulerInterval = setInterval(runScheduler, 5000); // Check every 5s
  console.log('Proactive agent system initialized');
}

export function shutdown() {
  if (schedulerInterval) clearInterval(schedulerInterval);
  scheduledTasks.clear();
  watchers.clear();
  console.log('Proactive system shut down');
}

export function getStatus() {
  return {
    scheduledTasks: [...scheduledTasks.values()].map(t => ({
      id: t.id,
      name: t.name,
      intervalMs: t.intervalMs,
      nextRun: t.nextRun,
      runCount: t.runCount,
      active: t.active
    })),
    watchers: [...watchers.values()].map(w => ({
      id: w.id,
      name: w.name,
      intervalMs: w.intervalMs,
      triggered: w.triggered
    }))
  };
}
