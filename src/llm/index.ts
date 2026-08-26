import { config } from '../config.js';
import type { LLMProviderName } from '../types.js';
import { completeAnthropic } from './anthropic.js';
import { completeOpenAICompat } from './openaiCompat.js';

export interface ByokCredentials {
  provider: string;
  apiKey: string;
  model?: string;
}

export interface ResolvedProvider {
  provider: LLMProviderName;
  apiKey: string;
  model: string;
}

const OPENAI_COMPAT_BASE_URLS: Record<'openai' | 'groq', string> = {
  openai: 'https://api.openai.com/v1',
  groq: 'https://api.groq.com/openai/v1',
};

function envProvider(name: LLMProviderName): ResolvedProvider | null {
  if (name === 'anthropic' && config.anthropicApiKey) {
    return { provider: 'anthropic', apiKey: config.anthropicApiKey, model: config.anthropicModel };
  }
  if (name === 'openai' && config.openaiApiKey) {
    return { provider: 'openai', apiKey: config.openaiApiKey, model: config.openaiModel };
  }
  if (name === 'groq' && config.groqApiKey) {
    return { provider: 'groq', apiKey: config.groqApiKey, model: config.groqModel };
  }
  return null;
}

function defaultModelFor(provider: LLMProviderName): string {
  if (provider === 'anthropic') return config.anthropicModel;
  if (provider === 'openai') return config.openaiModel;
  return config.groqModel;
}

/** BYO key wins over env config; among env config, LLM_PROVIDER wins, then anthropic, openai, groq in order. */
export function resolveProvider(byok?: ByokCredentials | null): ResolvedProvider | null {
  if (byok && config.allowByok) {
    const provider = byok.provider as LLMProviderName;
    if (provider === 'anthropic' || provider === 'openai' || provider === 'groq') {
      return { provider, apiKey: byok.apiKey, model: byok.model || defaultModelFor(provider) };
    }
  }

  if (config.llmProvider) {
    const resolved = envProvider(config.llmProvider);
    if (resolved) return resolved;
  }

  return envProvider('anthropic') || envProvider('openai') || envProvider('groq');
}

export interface CompleteOptions {
  provider: LLMProviderName;
  apiKey: string;
  model: string;
  system: string;
  prompt: string;
  maxTokens: number;
}

export async function complete(options: CompleteOptions): Promise<string> {
  if (options.provider === 'anthropic') {
    return completeAnthropic({
      apiKey: options.apiKey,
      model: options.model,
      system: options.system,
      prompt: options.prompt,
      maxTokens: options.maxTokens,
      effort: config.llmEffort,
    });
  }
  return completeOpenAICompat({
    baseUrl: OPENAI_COMPAT_BASE_URLS[options.provider],
    apiKey: options.apiKey,
    model: options.model,
    system: options.system,
    prompt: options.prompt,
    maxTokens: options.maxTokens,
  });
}
