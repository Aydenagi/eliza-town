# Eliza Town client/server protocol

This is the contract between `src/` (server) and `client/` (browser). Both sides must match it exactly.

## Identity

- An agent is identified everywhere by its `username` string (for example `eliza-planner`). No numeric ids on the wire.
- Hubs are identified by name: `town_square`, `planning_room`, `design_studio`, `coding_desk`, `review_station`, `deploy_station`.
- Roles: `planner | designer | coder | reviewer`.

## Shapes

```ts
type AgentRole = 'planner' | 'designer' | 'coder' | 'reviewer'
type AgentStatus = 'idle' | 'traveling' | 'working' | 'talking'
type HubName = 'town_square' | 'planning_room' | 'design_studio' | 'coding_desk' | 'review_station' | 'deploy_station'

interface Agent {
  id: string            // username
  name: string          // display name
  type: AgentRole
  status: AgentStatus
  current_hub: HubName
  doing: string | null  // short text of what the agent is doing right now
  model_id: string      // character model key, e.g. 'witch', 'protagonist_a'
  personality: string
  capabilities: string[]
}

type TaskStatus = 'queued' | 'planning' | 'designing' | 'coding' | 'reviewing' | 'completed' | 'failed'

interface Subtask {
  id: number
  role: AgentRole
  title: string
  description: string
  status: 'pending' | 'in_progress' | 'completed' | 'skipped'
  agentId: string | null
  output: string | null   // text output of the step (design doc, review, coder notes)
}

interface TaskFile { name: string; size: number }

interface Task {
  id: number
  title: string
  description: string
  status: TaskStatus
  priority: number        // 1 high .. 10 low, default 5
  sessionId: string | null
  mine?: boolean          // set by GET /api/tasks when the X-Session-Id header matches
  engine: 'llm' | 'simulation'
  provider: string | null // 'anthropic' | 'openai' | 'groq' | null
  queuePosition: number | null
  subtasks: Subtask[]
  files: TaskFile[]
  result: { summary: string; previewUrl: string | null } | null
  error: string | null
  createdAt: string       // ISO
  updatedAt: string
  completedAt: string | null
}

interface Message {
  id: number
  agentId: string
  agentName: string
  type: 'saying' | 'thought' | 'status' | 'code' | 'system'
  content: string
  taskId: number | null
  createdAt: string
}
```

## REST

All under `/api`. JSON bodies. Errors are `{ error: string, hint?: string }` with a proper status code.

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | `{ status:'ok', engine:'llm'|'simulation'|'eliza', provider: string|null, model: string|null, byok: boolean, storage:'memory'|'postgres', agents: number, queue: number, timestamp }` |
| GET | `/agents` | `Agent[]` |
| GET | `/agents/:id` | `Agent` |
| PATCH | `/agents/:id` | body `{ name?, personality?, capabilities?: string[] }` → `Agent` |
| GET | `/tasks` | `Task[]` newest first. Header `X-Session-Id` marks `mine`. |
| POST | `/tasks` | body `{ title: string, description?: string, priority?: number }`. Headers: `X-Session-Id` (required), `X-LLM-Provider` + `X-LLM-Key` (+ optional `X-LLM-Model`) for bring-your-own-key. 201 → `Task`. 429 when rate limited or queue full, 400 on bad input. |
| GET | `/tasks/:id` | `Task` |
| GET | `/tasks/:id/files` | `TaskFile[]` |
| GET | `/tasks/:id/files/:name` | file download (`Content-Disposition: attachment`) |
| GET | `/tasks/:id/preview/*` | serves the task output dir statically. Empty path → `index.html`. Response carries `Content-Security-Policy: sandbox allow-scripts allow-forms allow-modals allow-popups` so generated pages run in an opaque origin. |
| GET | `/messages?limit=50` | `Message[]` newest first |
| GET | `/state` | `{ agents: Agent[], tasks: Task[], messages: Message[] }` |

Rate limit: `TASK_RATE_LIMIT` tasks per IP per `TASK_RATE_WINDOW_MS` (defaults 5 per 10 min). Queue cap `MAX_QUEUE` (default 20).

The BYO key is used only for that task's LLM calls, kept in memory for the task's lifetime, never stored, logged, or broadcast.

## WebSocket

Path `/ws`. Every frame is `{ type: string, data: object, timestamp: number }`.

Client → server: `{ type: 'ping' }`.

Server → client:

| type | data |
|---|---|
| `connected` | `{ message }` |
| `pong` | `{}` |
| `state_update` | `{ agents: Agent[], tasks: Task[], messages: Message[] }` sent on connect and every 5 s |
| `agent_move` | `{ agentId, agentName, from: HubName, to: HubName, travelMs: number }` the client animates the walk so it takes exactly `travelMs` |
| `agent_arrived` | `{ agentId, hub: HubName }` |
| `agent_status` | `{ agentId, status: AgentStatus, doing: string|null }` |
| `agent_speak` | `{ agentId, agentName, text, type: 'saying'|'thought', taskId: number|null }` |
| `task_created` | `{ task: Task }` |
| `task_update` | `{ task: Task }` any status/subtask/queue change |
| `file_created` | `{ taskId, agentId, file: TaskFile }` |
| `task_complete` | `{ task: Task }` task.result is set |
| `task_failed` | `{ task: Task }` task.error is set |

## Pipeline

1. `queued` → waits for the planner to be idle.
2. `planning` → planner walks to `planning_room`, produces subtasks (roles design/code/review), speaks the plan.
3. `designing` → an idle designer walks to `design_studio`, writes `DESIGN.md`. Skipped when the planner emits no design subtask.
4. `coding` → an idle coder walks to `coding_desk`, writes the files.
5. `reviewing` → the reviewer walks to `review_station`, writes `REVIEW.md` ending with `VERDICT: approve` or `VERDICT: revise`. On `revise`, the coder gets one fix round, then the task completes regardless.
6. `completed` (or `failed` with `error`). Every agent returns to `town_square` when idle.

Between steps agents `agent_move` with `travelMs` computed from the canonical hub distances on the server (`max(1500, distance * 90)` ms). Idle agents occasionally wander to the square and say a canned line so the town looks alive.
