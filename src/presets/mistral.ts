import { ClientOptions } from '../types/index.js';
import type { ClientOptionsWithAI, PresetAIConfig } from '../types/ai-client.js';

export interface MistralPresetOptions {
  apiKey: string;
  /** Default model for chat completions @default 'mistral-large-3' */
  model?: string;
}

/**
 * Mistral AI preset
 * @see https://docs.mistral.ai/
 */
export function mistral(options: MistralPresetOptions): ClientOptions & ClientOptionsWithAI {
  const _aiConfig: PresetAIConfig = {
    provider: 'mistral',
    apiKey: options.apiKey,
    model: options.model ?? 'mistral-large-3',
    memory: { maxPairs: 12 },
  };

  return {
    baseUrl: 'https://api.mistral.ai/v1',
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
