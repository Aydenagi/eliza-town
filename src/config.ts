function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === 'true' || value === '1';
}

function num(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export type EngineMode = 'direct' | 'eliza';
export type LLMEffort = 'low' | 'medium' | 'high';

export const config = {
  engine: (process.env.ENGINE === 'eliza' ? 'eliza' : 'direct') as EngineMode,
  port: num(process.env.PORT, 3000),

  anthropicApiKey: process.env.ANTHROPIC_API_KEY || null,
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-opus-5',
  openaiApiKey: process.env.OPENAI_API_KEY || null,
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o',
  groqApiKey: process.env.GROQ_API_KEY || null,
  groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  llmProvider: (process.env.LLM_PROVIDER as 'anthropic' | 'openai' | 'groq' | undefined) || null,
  llmEffort: (process.env.LLM_EFFORT as LLMEffort | undefined) || ('medium' as LLMEffort),

  allowByok: bool(process.env.ALLOW_BYOK, true),

  databaseUrl: process.env.DATABASE_URL || null,
  outputDir: process.env.OUTPUT_DIR || './output',

  maxConcurrentTasks: num(process.env.MAX_CONCURRENT_TASKS, 2),
  maxQueue: num(process.env.MAX_QUEUE, 20),
  taskRateLimit: num(process.env.TASK_RATE_LIMIT, 5),
  taskRateWindowMs: num(process.env.TASK_RATE_WINDOW_MS, 600_000),

  demoMode: bool(process.env.DEMO_MODE, false),
  demoTaskIntervalMs: num(process.env.DEMO_TASK_INTERVAL, 180_000),
};
