import pg from 'pg';
import { ELIZA_TOWN_CHARACTERS, HUBS } from '../characters.js';
import type {
  Agent,
  AgentUpdateFields,
  ApiCall,
  Hub,
  Message,
  Store,
  Subtask,
  Task,
  TaskFieldUpdate,
  TaskFileRecord,
} from './types.js';

const { Pool } = pg;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS hubs (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  type VARCHAR(50) NOT NULL,
  position_x FLOAT NOT NULL DEFAULT 0,
  position_z FLOAT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agents (
  id SERIAL PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL,
  model_id VARCHAR(50) NOT NULL,
  current_hub_id INTEGER REFERENCES hubs(id),
  status VARCHAR(30) DEFAULT 'idle',
  position_x FLOAT,
  position_z FLOAT,
  personality TEXT,
  capabilities TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(30) DEFAULT 'pending',
  priority INTEGER DEFAULT 5,
  assigned_agent_id INTEGER REFERENCES agents(id),
  session_id VARCHAR(64),
  engine VARCHAR(20),
  provider VARCHAR(20),
  error TEXT,
  result_summary TEXT,
  preview_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subtasks (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  role VARCHAR(20),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(30) DEFAULT 'pending',
  agent_username VARCHAR(64),
  order_index INTEGER DEFAULT 0,
  output TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  agent_id INTEGER NOT NULL REFERENCES agents(id),
  task_id INTEGER REFERENCES tasks(id),
  subtask_id INTEGER REFERENCES subtasks(id),
  type VARCHAR(30) NOT NULL,
  content TEXT NOT NULL,
  target_agent_id INTEGER REFERENCES agents(id),
  hub_id INTEGER REFERENCES hubs(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS task_files (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  size INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS api_calls (
  id SERIAL PRIMARY KEY,
  agent_id INTEGER REFERENCES agents(id),
  task_id INTEGER REFERENCES tasks(id),
  model VARCHAR(50) NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  prompt_summary TEXT,
  response_summary TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_session ON tasks(session_id);
CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id);
CREATE INDEX IF NOT EXISTS idx_messages_task ON messages(task_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_task_files_task ON task_files(task_id);
`;

const MIGRATIONS = [
  'ALTER TABLE agents ADD COLUMN IF NOT EXISTS username VARCHAR(64)',
  'ALTER TABLE tasks ADD COLUMN IF NOT EXISTS session_id VARCHAR(64)',
  'ALTER TABLE tasks ADD COLUMN IF NOT EXISTS engine VARCHAR(20)',
  'ALTER TABLE tasks ADD COLUMN IF NOT EXISTS provider VARCHAR(20)',
  'ALTER TABLE tasks ADD COLUMN IF NOT EXISTS error TEXT',
  'ALTER TABLE tasks ADD COLUMN IF NOT EXISTS result_summary TEXT',
  'ALTER TABLE tasks ADD COLUMN IF NOT EXISTS preview_url TEXT',
  'ALTER TABLE subtasks ADD COLUMN IF NOT EXISTS role VARCHAR(20)',
  'ALTER TABLE subtasks ADD COLUMN IF NOT EXISTS agent_username VARCHAR(64)',
];

async function migrateCapabilitiesColumn(pool: pg.Pool): Promise<void> {
  const result = await pool.query<{ data_type: string }>(
    `SELECT data_type FROM information_schema.columns WHERE table_name = 'agents' AND column_name = 'capabilities'`
  );
  const dataType = result.rows[0]?.data_type;
  if (dataType === 'ARRAY') {
    await pool.query(
      `ALTER TABLE agents ALTER COLUMN capabilities TYPE TEXT USING array_to_string(capabilities, ',')`
    );
  }
}

export function createPgStore(connectionString: string): Store & { init(): Promise<void> } {
  const pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  async function init(): Promise<void> {
    await pool.query(SCHEMA);
    for (const migration of MIGRATIONS) {
      await pool.query(migration);
    }
    try {
      await migrateCapabilitiesColumn(pool);
    } catch (error) {
      console.error('[store/pg] capabilities column migration skipped:', (error as Error).message);
    }

    for (const [name, hub] of Object.entries(HUBS)) {
      await pool.query(
        `INSERT INTO hubs (name, type, position_x, position_z) VALUES ($1, $2, $3, $4)
         ON CONFLICT (name) DO NOTHING`,
        [name, name, hub.x, hub.z]
      );
    }

    const { rows } = await pool.query<{ count: string }>('SELECT COUNT(*) FROM agents');
    if (Number(rows[0].count) === 0) {
      for (const character of ELIZA_TOWN_CHARACTERS) {
        await pool.query(
          `INSERT INTO agents (username, name, type, model_id, personality, capabilities)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (username) DO NOTHING`,
          [
            character.username,
            character.name,
            character.role,
            character.modelId,
            character.adjectives.join(', '),
            character.capabilities.join(','),
          ]
        );
      }
    }
  }

  async function getAgents(): Promise<Agent[]> {
    const { rows } = await pool.query<Agent>('SELECT * FROM agents ORDER BY id');
    return rows;
  }

  async function getAgent(id: number): Promise<Agent | undefined> {
    const { rows } = await pool.query<Agent>('SELECT * FROM agents WHERE id = $1', [id]);
    return rows[0];
  }

  async function getAgentByUsername(username: string): Promise<Agent | undefined> {
    const { rows } = await pool.query<Agent>('SELECT * FROM agents WHERE username = $1', [username]);
    return rows[0];
  }

  async function updateAgentStatus(
    id: number,
    status: string,
    hubId: number | null = null,
    positionX: number | null = null,
    positionZ: number | null = null
  ): Promise<Agent | undefined> {
    const updates = ['status = $2', 'updated_at = CURRENT_TIMESTAMP'];
    const params: (number | string | null)[] = [id, status];
    let i = 3;
    if (hubId !== null) {
      updates.push(`current_hub_id = $${i++}`);
      params.push(hubId);
    }
    if (positionX !== null) {
      updates.push(`position_x = $${i++}`);
      params.push(positionX);
    }
    if (positionZ !== null) {
      updates.push(`position_z = $${i++}`);
      params.push(positionZ);
    }
    const { rows } = await pool.query<Agent>(
      `UPDATE agents SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );
    return rows[0];
  }

  async function createAgent(
    username: string,
    name: string,
    type: string,
    modelId: string,
    personality: string,
    capabilities: string
  ): Promise<Agent> {
    const { rows } = await pool.query<Agent>(
      `INSERT INTO agents (username, name, type, model_id, personality, capabilities)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [username, name, type, modelId, personality, capabilities]
    );
    return rows[0];
  }

  async function updateAgent(id: number, updates: AgentUpdateFields): Promise<Agent | undefined> {
    const fields: string[] = [];
    const params: (number | string)[] = [id];
    let i = 2;
    if (updates.name !== undefined) {
      fields.push(`name = $${i++}`);
      params.push(updates.name);
    }
    if (updates.type !== undefined) {
      fields.push(`type = $${i++}`);
      params.push(updates.type);
    }
    if (updates.model_id !== undefined) {
      fields.push(`model_id = $${i++}`);
      params.push(updates.model_id);
    }
    if (updates.personality !== undefined) {
      fields.push(`personality = $${i++}`);
      params.push(updates.personality);
    }
    if (updates.capabilities !== undefined) {
      fields.push(`capabilities = $${i++}`);
      params.push(updates.capabilities);
    }
    if (fields.length === 0) return getAgent(id);
    fields.push('updated_at = CURRENT_TIMESTAMP');
    const { rows } = await pool.query<Agent>(
      `UPDATE agents SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );
    return rows[0];
  }

  async function getHubs(): Promise<Hub[]> {
    const { rows } = await pool.query<Hub>('SELECT * FROM hubs ORDER BY id');
    return rows;
  }

  async function getHub(id: number): Promise<Hub | undefined> {
    const { rows } = await pool.query<Hub>('SELECT * FROM hubs WHERE id = $1', [id]);
    return rows[0];
  }

  async function getHubByName(name: string): Promise<Hub | undefined> {
    const { rows } = await pool.query<Hub>('SELECT * FROM hubs WHERE name = $1', [name]);
    return rows[0];
  }

  async function getTasks(status: string | null = null, sessionId: string | null = null): Promise<Task[]> {
    const conditions: string[] = [];
    const params: string[] = [];
    let i = 1;
    if (status) {
      conditions.push(`status = $${i++}`);
      params.push(status);
    }
    if (sessionId) {
      conditions.push(`session_id = $${i++}`);
      params.push(sessionId);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query<Task>(
      `SELECT * FROM tasks ${where} ORDER BY priority, created_at`,
      params
    );
    return rows;
  }

  async function listTasksNewestFirst(sessionId: string | null = null): Promise<Task[]> {
    const where = sessionId ? 'WHERE session_id = $1' : '';
    const params = sessionId ? [sessionId] : [];
    const { rows } = await pool.query<Task>(
      `SELECT * FROM tasks ${where} ORDER BY created_at DESC`,
      params
    );
    return rows;
  }

  async function getTask(id: number): Promise<Task | undefined> {
    const { rows } = await pool.query<Task>('SELECT * FROM tasks WHERE id = $1', [id]);
    return rows[0];
  }

  async function createTask(
    title: string,
    description: string | null,
    priority = 5,
    sessionId: string | null = null
  ): Promise<Task> {
    const { rows } = await pool.query<Task>(
      `INSERT INTO tasks (title, description, priority, session_id) VALUES ($1, $2, $3, $4) RETURNING *`,
      [title, description, priority, sessionId]
    );
    return rows[0];
  }

  async function updateTaskStatus(
    id: number,
    status: string,
    assignedAgentId: number | null = null
  ): Promise<Task | undefined> {
    const updates = ['status = $2', 'updated_at = CURRENT_TIMESTAMP'];
    const params: (number | string | null)[] = [id, status];
    if (assignedAgentId !== null) {
      updates.push('assigned_agent_id = $3');
      params.push(assignedAgentId);
    }
    if (status === 'completed') updates.push('completed_at = CURRENT_TIMESTAMP');
    const { rows } = await pool.query<Task>(
      `UPDATE tasks SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );
    return rows[0];
  }

  async function setTaskFields(id: number, fields: TaskFieldUpdate): Promise<Task | undefined> {
    const entries = Object.entries(fields);
    if (entries.length === 0) return getTask(id);
    const sets = entries.map(([key], i) => `${key} = $${i + 2}`);
    sets.push('updated_at = CURRENT_TIMESTAMP');
    const params: unknown[] = [id, ...entries.map(([, v]) => v)];
    const { rows } = await pool.query<Task>(
      `UPDATE tasks SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      params as (string | number | null)[]
    );
    return rows[0];
  }

  async function getSubtasks(taskId: number): Promise<Subtask[]> {
    const { rows } = await pool.query<Subtask>(
      'SELECT * FROM subtasks WHERE task_id = $1 ORDER BY order_index',
      [taskId]
    );
    return rows;
  }

  async function createSubtask(
    taskId: number,
    title: string,
    description: string | null,
    orderIndex: number,
    role: string | null = null
  ): Promise<Subtask> {
    const { rows } = await pool.query<Subtask>(
      `INSERT INTO subtasks (task_id, title, description, order_index, role)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [taskId, title, description, orderIndex, role]
    );
    return rows[0];
  }

  async function updateSubtaskStatus(
    id: number,
    status: string,
    output: string | null = null
  ): Promise<Subtask | undefined> {
    const updates = ['status = $2', 'updated_at = CURRENT_TIMESTAMP'];
    const params: (number | string | null)[] = [id, status];
    if (output !== null) {
      updates.push('output = $3');
      params.push(output);
    }
    if (status === 'completed') updates.push('completed_at = CURRENT_TIMESTAMP');
    const { rows } = await pool.query<Subtask>(
      `UPDATE subtasks SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );
    return rows[0];
  }

  async function assignSubtaskAgent(id: number, agentUsername: string): Promise<Subtask | undefined> {
    const { rows } = await pool.query<Subtask>(
      'UPDATE subtasks SET agent_username = $2 WHERE id = $1 RETURNING *',
      [id, agentUsername]
    );
    return rows[0];
  }

  async function createMessage(
    agentId: number,
    type: string,
    content: string,
    taskId: number | null = null,
    subtaskId: number | null = null,
    targetAgentId: number | null = null,
    hubId: number | null = null
  ): Promise<Message> {
    const { rows } = await pool.query<Message>(
      `INSERT INTO messages (agent_id, type, content, task_id, subtask_id, target_agent_id, hub_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [agentId, type, content, taskId, subtaskId, targetAgentId, hubId]
    );
    return rows[0];
  }

  async function getRecentMessages(limit = 50): Promise<Message[]> {
    const { rows } = await pool.query<Message>(
      `SELECT m.*, a.name as agent_name, a.type as agent_type
       FROM messages m JOIN agents a ON m.agent_id = a.id
       ORDER BY m.created_at DESC LIMIT $1`,
      [limit]
    );
    return rows;
  }

  async function logApiCall(
    agentId: number,
    taskId: number | null,
    model: string,
    inputTokens: number,
    outputTokens: number,
    promptSummary: string,
    responseSummary: string,
    durationMs: number
  ): Promise<ApiCall> {
    const { rows } = await pool.query<ApiCall>(
      `INSERT INTO api_calls (agent_id, task_id, model, input_tokens, output_tokens, prompt_summary, response_summary, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [agentId, taskId, model, inputTokens, outputTokens, promptSummary, responseSummary, durationMs]
    );
    return rows[0];
  }

  async function addTaskFile(taskId: number, file: TaskFileRecord): Promise<void> {
    await pool.query('INSERT INTO task_files (task_id, name, size) VALUES ($1, $2, $3)', [
      taskId,
      file.name,
      file.size,
    ]);
  }

  return {
    kind: 'postgres',
    init,
    getAgents,
    getAgent,
    getAgentByUsername,
    updateAgentStatus,
    createAgent,
    updateAgent,
    getHubs,
    getHub,
    getHubByName,
    getTasks,
    listTasksNewestFirst,
    getTask,
    createTask,
    updateTaskStatus,
    setTaskFields,
    getSubtasks,
    createSubtask,
    updateSubtaskStatus,
    assignSubtaskAgent,
    createMessage,
    getRecentMessages,
    logApiCall,
    addTaskFile,
  };
}
