import { ClientOptions } from '../types/index.js';
import type { ClientOptionsWithAI, PresetAIConfig } from '../types/ai-client.js';

export interface DeepSeekPresetOptions {
  apiKey: string;
  /** Default model for chat completions @default 'deepseek-v3.2' */
  model?: string;
}

/**
 * DeepSeek AI preset
 * @see https://platform.deepseek.com/docs
 */
export function deepseek(options: DeepSeekPresetOptions): ClientOptions & ClientOptionsWithAI {
  const _aiConfig: PresetAIConfig = {
    provider: 'deepseek',
    apiKey: options.apiKey,
    model: options.model ?? 'deepseek-v3.2',
    memory: { maxPairs: 12 },
  };

  return {
    baseUrl: 'https://api.deepseek.com/v1',
    headers: {
      'Authorization': `Bearer ${options.apiKey}`,
    },
    timeout: 10 * 60 * 1000,
    retry: {
      maxAttempts: 5,
      backoff: 'exponential',
      delay: 1000,
      statusCodes: [408, 429, 500, 502, 503, 504]
    },
    _aiConfig,
  };
}
