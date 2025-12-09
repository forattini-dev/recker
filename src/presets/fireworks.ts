import { ClientOptions } from '../types/index.js';
import type { ClientOptionsWithAI, PresetAIConfig } from '../types/ai-client.js';

export interface FireworksPresetOptions {
  apiKey: string;
  /** Default model for chat completions @default 'accounts/fireworks/models/llama-v3p3-70b-instruct' */
  model?: string;
}

/**
 * Fireworks AI preset
 * @see https://docs.fireworks.ai/
 */
export function fireworks(options: FireworksPresetOptions): ClientOptions & ClientOptionsWithAI {
  const _aiConfig: PresetAIConfig = {
    provider: 'fireworks',
    apiKey: options.apiKey,
    model: options.model ?? 'accounts/fireworks/models/llama-v3p3-70b-instruct',
    memory: { maxPairs: 12 },
  };

  return {
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    headers: {
      'Authorization': `Bearer ${options.apiKey}`,
    },
    timeout: 5 * 60 * 1000,
    retry: {
      maxAttempts: 3,
      backoff: 'exponential',
      delay: 500,
      statusCodes: [408, 429, 500, 502, 503, 504]
    },
    _aiConfig,
  };
}
