// Multi-channel connector service - OpenClaw-inspired always-on messaging
// Supports Discord, Telegram, and generic webhooks

import * as claude from '../agents/claude.js';
import * as db from '../db/index.js';
import { broadcast } from '../websocket/index.js';

// Channel state
const channels = new Map(); // channelId -> { type, config, connected }
const messageQueue = []; // Incoming messages from all channels
let processingInterval = null;

// === DISCORD CONNECTOR ===

let discordClient = null;

async function initDiscord() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return null;

  try {
    // Dynamic import - only load if token is configured
    const { Client, GatewayIntentBits } = await import('discord.js');
    discordClient = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
      ]
    });

    discordClient.on('ready', () => {
      console.log(`Discord connected as ${discordClient.user.tag}`);
      channels.set('discord', { type: 'discord', connected: true, botUser: discordClient.user.tag });
      broadcast({ type: 'channel_connected', data: { channel: 'discord', user: discordClient.user.tag } });
    });

    discordClient.on('messageCreate', async (message) => {
      // Ignore own messages
      if (message.author.bot) return;

      // Respond to mentions or DMs
      const isMention = message.mentions.has(discordClient.user);
      const isDM = !message.guild;

      if (isMention || isDM) {
        const content = message.content.replace(/<@!?\d+>/g, '').trim();
        if (!content) return;

        enqueueMessage({
          source: 'discord',
          channelId: message.channel.id,
          userId: message.author.id,
          userName: message.author.username,
          content,
          isDM,
          replyFn: async (text) => {
            await message.reply(text.substring(0, 2000));
          }
        });
      }
    });

    await discordClient.login(token);
    return discordClient;
  } catch (error) {
    console.error('Discord init error:', error.message);
    return null;
  }
}

// === TELEGRAM CONNECTOR ===

let telegramBot = null;
let telegramPolling = null;

async function initTelegram() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;

  try {
    const apiUrl = `https://api.telegram.org/bot${token}`;
    let offset = 0;

    // Verify token
    const meResponse = await fetch(`${apiUrl}/getMe`);
    const meData = await meResponse.json();
    if (!meData.ok) throw new Error(meData.description);

    const botName = meData.result.username;
    console.log(`Telegram connected as @${botName}`);
    channels.set('telegram', { type: 'telegram', connected: true, botUser: `@${botName}` });
    broadcast({ type: 'channel_connected', data: { channel: 'telegram', user: `@${botName}` } });

    // Long polling for messages
    telegramPolling = setInterval(async () => {
      try {
        const res = await fetch(`${apiUrl}/getUpdates?offset=${offset}&timeout=1&allowed_updates=["message"]`);
        const data = await res.json();

        if (data.ok && data.result.length > 0) {
          for (const update of data.result) {
            offset = update.update_id + 1;
            const msg = update.message;
            if (!msg || !msg.text) continue;

            // Respond to /start, direct messages, or mentions
            const text = msg.text.replace(/^\/\w+\s*/, '').trim();
            if (msg.text.startsWith('/start')) {
              await fetch(`${apiUrl}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: msg.chat.id,
                  text: 'Welcome to Eliza Town! Send me any message and my agents will help you.'
                })
              });
              continue;
            }

            if (!text) continue;

            enqueueMessage({
              source: 'telegram',
              channelId: String(msg.chat.id),
              userId: String(msg.from.id),
              userName: msg.from.username || msg.from.first_name,
              content: text,
              isDM: msg.chat.type === 'private',
              replyFn: async (replyText) => {
                await fetch(`${apiUrl}/sendMessage`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    chat_id: msg.chat.id,
                    text: replyText.substring(0, 4096),
                    reply_to_message_id: msg.message_id
                  })
                });
              }
            });
          }
        }
      } catch (err) {
        console.error('Telegram polling error:', err.message);
      }
    }, 2000);

    telegramBot = { apiUrl, botName };
    return telegramBot;
  } catch (error) {
    console.error('Telegram init error:', error.message);
    return null;
  }
}

// === WEBHOOK CONNECTOR ===
// Generic webhook handler for any external service

const webhookSecrets = new Map(); // webhookId -> secret

export function registerWebhook(id, secret, config = {}) {
  webhookSecrets.set(id, { secret, ...config });
  channels.set(`webhook:${id}`, { type: 'webhook', connected: true, id });
  console.log(`Webhook registered: ${id}`);
  return { id, endpoint: `/api/webhooks/${id}/incoming` };
}

export function handleWebhookMessage(webhookId, payload, secret) {
  const hook = webhookSecrets.get(webhookId);
  if (!hook) return { error: 'Unknown webhook' };
  if (hook.secret && hook.secret !== secret) return { error: 'Invalid secret' };

  const { text, user, channel, replyUrl } = payload;
  if (!text) return { error: 'No text provided' };

  enqueueMessage({
    source: `webhook:${webhookId}`,
    channelId: channel || webhookId,
    userId: user || 'webhook',
    userName: user || 'External User',
    content: text,
    isDM: true,
    replyFn: replyUrl ? async (replyText) => {
      try {
        await fetch(replyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: replyText, source: 'eliza-town' })
        });
      } catch (err) {
        console.error('Webhook reply error:', err.message);
      }
    } : null
  });

  return { queued: true };
}

// === MESSAGE PROCESSING ===

function enqueueMessage(msg) {
  messageQueue.push({ ...msg, receivedAt: Date.now() });
  broadcast({
    type: 'channel_message',
    data: {
      source: msg.source,
      userName: msg.userName,
      content: msg.content,
      timestamp: Date.now()
    }
  });
}

async function processMessageQueue() {
  if (messageQueue.length === 0) return;

  const msg = messageQueue.shift();

  try {
    // Get all agents for response
    const agents = await db.getAgents();
    if (agents.length === 0) return;

    // Log incoming message
    broadcast({
      type: 'agent_think',
      data: {
        agent: 'System',
        agentId: null,
        text: `[${msg.source}] ${msg.userName}: ${msg.content}`
      }
    });

    // Route to agents via chatWithUser
    const responses = await claude.chatWithUser(agents, msg.content);

    // Pick the best response (first non-empty, prefer Claude agent)
    let bestResponse = null;
    for (const r of responses) {
      if (r.response && r.response.trim()) {
        if (r.agentName === 'Claude' || !bestResponse) {
          bestResponse = r;
        }
      }
    }

    if (bestResponse && msg.replyFn) {
      // Format response
      const replyText = `[${bestResponse.agentName}] ${bestResponse.response}`;

      // Send reply back to the channel
      await msg.replyFn(replyText);

      // Broadcast that we replied
      broadcast({
        type: 'agent_speak',
        data: {
          agent: bestResponse.agentName,
          agentId: bestResponse.agentId,
          text: `Replied to ${msg.userName} on ${msg.source}`,
          type: 'saying'
        }
      });

      // Log the interaction
      await db.createMessage(
        bestResponse.agentId,
        'chat',
        `[${msg.source}] ${msg.userName}: ${msg.content} -> ${bestResponse.response}`
      );
    }

    // Check if this is a task request
    if (isTaskRequest(msg.content)) {
      const taskTitle = extractTaskTitle(msg.content);
      const { createTask } = await import('../orchestration/loop.js');
      const task = await createTask(taskTitle, msg.content, 5, `channel:${msg.source}:${msg.userId}`);

      if (msg.replyFn) {
        await msg.replyFn(`Task created: "${taskTitle}" - I'll notify you when it's done!`);
      }

      broadcast({
        type: 'task_created',
        data: { ...task, source: msg.source, userName: msg.userName }
      });
    }
  } catch (error) {
    console.error('Message processing error:', error.message);
  }
}

function isTaskRequest(text) {
  const lower = text.toLowerCase();
  return lower.startsWith('task:') ||
    lower.startsWith('todo:') ||
    lower.startsWith('build ') ||
    lower.startsWith('create ') ||
    lower.startsWith('make ') ||
    lower.includes('can you build') ||
    lower.includes('can you create') ||
    lower.includes('can you make');
}

function extractTaskTitle(text) {
  const lower = text.toLowerCase();
  if (lower.startsWith('task:') || lower.startsWith('todo:')) {
    return text.substring(text.indexOf(':') + 1).trim();
  }
  // Extract meaningful part
  return text.substring(0, 100);
}

// === LIFECYCLE ===

export async function initialize() {
  const results = { discord: false, telegram: false };

  // Initialize channels in parallel
  const [discord, telegram] = await Promise.allSettled([
    initDiscord(),
    initTelegram()
  ]);

  results.discord = discord.status === 'fulfilled' && discord.value !== null;
  results.telegram = telegram.status === 'fulfilled' && telegram.value !== null;

  // Register any pre-configured webhooks
  if (process.env.WEBHOOK_SECRET) {
    registerWebhook('default', process.env.WEBHOOK_SECRET);
  }

  // Start message processing loop
  processingInterval = setInterval(processMessageQueue, 1000);

  const connected = Object.entries(results).filter(([, v]) => v).map(([k]) => k);
  if (connected.length > 0) {
    console.log(`Channels connected: ${connected.join(', ')}`);
  } else {
    console.log('No messaging channels configured (set DISCORD_BOT_TOKEN or TELEGRAM_BOT_TOKEN)');
  }

  return results;
}

export function shutdown() {
  if (processingInterval) clearInterval(processingInterval);
  if (telegramPolling) clearInterval(telegramPolling);
  if (discordClient) {
    discordClient.destroy();
    discordClient = null;
  }
  console.log('Channels shut down');
}

export function getStatus() {
  return {
    channels: Object.fromEntries(channels),
    queueLength: messageQueue.length,
    connectedCount: [...channels.values()].filter(c => c.connected).length
  };
}

export function getConnectedChannels() {
  return [...channels.entries()].map(([id, info]) => ({ id, ...info }));
}
