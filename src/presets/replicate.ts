import { ClientOptions } from '../types/index.js';
import type { ClientOptionsWithAI, PresetAIConfig } from '../types/ai-client.js';

export interface ReplicatePresetOptions {
  apiKey: string;
  /** Default model for chat completions @default 'meta/llama-2-70b-chat' */
  model?: string;
}

/**
 * Replicate AI preset
 * @see https://replicate.com/docs
 */
export function replicate(options: ReplicatePresetOptions): ClientOptions & ClientOptionsWithAI {
  const _aiConfig: PresetAIConfig = {
    provider: 'replicate',
    apiKey: options.apiKey,
    model: options.model ?? 'meta/llama-2-70b-chat',
    memory: { maxPairs: 12 },
  };

  return {
    baseUrl: 'https://api.replicate.com/v1',
    headers: {
      'Authorization': `Token ${options.apiKey}`,
      'Content-Type': 'application/json',
    },
    // Replicate can take a while for model cold starts
    timeout: 15 * 60 * 1000,
    retry: {
      maxAttempts: 3,
      backoff: 'exponential',
      delay: 2000,
      statusCodes: [408, 429, 500, 502, 503, 504]
    },
    _aiConfig,
  };
}
