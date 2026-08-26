# Eliza Town

A town of AI agents that turns a typed task into a working result. Type what you want, and a
planner, designer, coder, and reviewer walk between hubs and build it, live, in the browser.

<img width="2400" height="1260" alt="image" src="https://github.com/user-attachments/assets/2cfadb49-47a2-489e-92a9-bb473930ed09" />

## Quick start

No configuration required. This runs a full town in simulation mode: agents walk the pipeline
and write honest placeholder files so you can see the whole flow end to end.

```bash
npm install
npm run dev
```

Open the printed URL, type a task, and watch it move through planning, design, coding, and
review.

## Adding a real LLM key

Set one of these in `.env` (copy `.env.example`) and restart:

```bash
ANTHROPIC_API_KEY=sk-ant-...
# or
OPENAI_API_KEY=sk-...
# or
GROQ_API_KEY=gsk_...
```

The health endpoint (`/api/health`) reports `engine: "llm"` once a key is active, and every task
after that produces real output instead of a placeholder.

To prove the LLM path works from the terminal, run one task end to end (one planner, coder and
reviewer call):

```bash
ANTHROPIC_API_KEY=sk-ant-... bun scripts/llm-check.ts
```

## Bring your own key

Anyone can paste their own API key into the town's key box in the browser, with no server
configuration at all. That key is sent per task in the `X-LLM-Provider` / `X-LLM-Key` /
`X-LLM-Model` headers, used only for that task's LLM calls, held in memory for the task's
lifetime, and never stored, logged, or broadcast. Set `ALLOW_BYOK=false` to turn this off
server-wide.

## Worlds

The town ships with four selectable worlds: Medieval Town, Saltmarsh Harbor, Night City, and
Cloudspire. Every building, pier, tower, and bridge is generated in three.js from primitives
(`client/src/scene/build/`), so a world is a small data file of structures, hubs, and a walk
graph (`client/src/worlds/`). The agents, roles, and pipeline are the same in every world; only the
setting changes.

## Engines

| Engine | When it runs | What it does |
|---|---|---|
| `direct` (default) | Always, unless `ENGINE=eliza` | The built-in task pipeline: plan, design, code, review. Uses a real LLM if one is configured, otherwise falls back to simulation. |
| `simulation` | No LLM key on the server and no bring-your-own key on the task | Same pipeline and timing, canned output, clearly labeled as simulated. |
| `eliza` | `ENGINE=eliza` | Boots the ElizaOS agent runtime instead of the built-in pipeline. Opt-in; requires an LLM key. |

## Environment variables

All optional. See `.env.example` for the full list with comments. The most relevant:

| Variable | Default | Purpose |
|---|---|---|
| `ENGINE` | `direct` | `direct` or `eliza` |
| `PORT` | `3000` | HTTP port |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GROQ_API_KEY` | unset | Server-side LLM credentials |
| `LLM_PROVIDER` | unset | Force one provider when multiple keys are set |
| `ALLOW_BYOK` | `true` | Allow browser-supplied keys per task |
| `DATABASE_URL` | unset | Postgres connection string; omit for in-memory storage |
| `OUTPUT_DIR` | `./output` | Where generated task files are written |
| `MAX_CONCURRENT_TASKS` | `2` | Tasks the pipeline runs in parallel |
| `MAX_QUEUE` | `20` | Max queued tasks before `POST /api/tasks` returns 429 |
| `TASK_RATE_LIMIT` / `TASK_RATE_WINDOW_MS` | `5` / `600000` | Per-IP task rate limit |
| `DEMO_MODE` | `false` | Auto-create a task from a template whenever the queue is empty |

## API

The full contract between server and client, including REST routes and WebSocket frame shapes,
is documented in [`docs/PROTOCOL.md`](docs/PROTOCOL.md).

## Deployment

Deployed on [Render](https://render.com) as a single web service:

```yaml
buildCommand: npm install && npm run build
startCommand: npm start
```

`npm run build` compiles the server with `tsc` and builds the client with Vite. Postgres is
optional; without `DATABASE_URL` the service runs entirely in memory.

## License

MIT License, see [LICENSE](LICENSE) for details.
