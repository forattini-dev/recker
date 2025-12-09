import { ClientOptions } from '../types/index.js';
import type { ClientOptionsWithAI, PresetAIConfig } from '../types/ai-client.js';

export interface CoherePresetOptions {
  apiKey: string;
  /** Default model for chat completions @default 'command-a-03-2025' */
  model?: string;
}

/**
 * Cohere AI preset
 * @see https://docs.cohere.com/
 */
export function cohere(options: CoherePresetOptions): ClientOptions & ClientOptionsWithAI {
  const _aiConfig: PresetAIConfig = {
    provider: 'cohere',
    apiKey: options.apiKey,
    model: options.model ?? 'command-a-03-2025',
    memory: { maxPairs: 12 },
  };

  return {
    baseUrl: 'https://api.cohere.ai/v1',
    headers: {
      'Authorization': `Bearer ${options.apiKey}`,
    },
    timeout: 5 * 60 * 1000,
    retry: {
      maxAttempts: 5,
      backoff: 'exponential',
      delay: 1000,
      statusCodes: [408, 429, 500, 502, 503, 504]
    },
    _aiConfig,
  };
}
