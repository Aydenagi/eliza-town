import Anthropic from '@anthropic-ai/sdk';
import type { LLMEffort } from '../config.js';

export interface AnthropicCallOptions {
  apiKey: string;
  model: string;
  system: string;
  prompt: string;
  maxTokens: number;
  effort: LLMEffort;
}

interface StopDetails {
  explanation?: string;
}

export async function completeAnthropic(options: AnthropicCallOptions): Promise<string> {
  const client = new Anthropic({ apiKey: options.apiKey, timeout: 180_000 });

  let message: Anthropic.Beta.Messages.BetaMessage;
  try {
    const stream = client.beta.messages.stream({
      model: options.model,
      max_tokens: options.maxTokens,
      system: options.system,
      messages: [{ role: 'user', content: options.prompt }],
      thinking: { type: 'adaptive' },
      output_config: { effort: options.effort },
      betas: ['server-side-fallback-2026-07-01'],
      ...({ fallbacks: 'default' } as Record<string, unknown>),
    });
    message = await stream.finalMessage();
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      throw new Error('Anthropic rejected the API key. Check ANTHROPIC_API_KEY, or the key pasted in the browser.');
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new Error('Anthropic rate limit hit. Wait a moment and try again, or switch providers.');
    }
    if (error instanceof Anthropic.APIError) {
      throw new Error(`Anthropic API error (status ${error.status}): ${error.message}`);
    }
    throw error;
  }

  if (message.stop_reason === 'refusal') {
    const details = (message as unknown as { stop_details?: StopDetails }).stop_details;
    throw new Error(`Anthropic refused the request: ${details?.explanation || 'no explanation given'}`);
  }

  const text = message.content
    .filter((block): block is Anthropic.Beta.Messages.BetaTextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  if (!text.trim()) {
    throw new Error('Anthropic returned an empty response.');
  }

  return text;
}
