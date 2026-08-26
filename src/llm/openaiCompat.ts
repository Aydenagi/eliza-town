export interface OpenAICompatOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  system: string;
  prompt: string;
  maxTokens: number;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export async function completeOpenAICompat(options: OpenAICompatOptions): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);

  let response: Response;
  try {
    response = await fetch(`${options.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        max_tokens: options.maxTokens,
        messages: [
          { role: 'system', content: options.system },
          { role: 'user', content: options.prompt },
        ],
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new Error(`${options.baseUrl} did not respond within 180s. Try again or switch providers.`);
    }
    throw new Error(`Could not reach ${options.baseUrl}: ${(error as Error).message}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 401) {
      throw new Error(`${options.baseUrl} rejected the API key (401). Check the key and try again.`);
    }
    throw new Error(`${options.baseUrl} returned ${response.status}: ${body.slice(0, 300)}`);
  }

  const json = (await response.json()) as ChatCompletionResponse;
  const text = json.choices?.[0]?.message?.content;
  if (!text || !text.trim()) {
    throw new Error(`${options.baseUrl} returned an empty response.`);
  }
  return text;
}
