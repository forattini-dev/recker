import { ClientOptions } from '../types/index.js';
import type { ClientOptionsWithAI, PresetAIConfig } from '../types/ai-client.js';

export interface TogetherPresetOptions {
  apiKey: string;
  /** Default model for chat completions @default 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8' */
  model?: string;
}

/**
 * Together AI preset
 * @see https://docs.together.ai/
 */
export function together(options: TogetherPresetOptions): ClientOptions & ClientOptionsWithAI {
  const _aiConfig: PresetAIConfig = {
    provider: 'together',
    apiKey: options.apiKey,
    model: options.model ?? 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
    memory: { maxPairs: 12 },
  };

  return {
    baseUrl: 'https://api.together.xyz/v1',
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
