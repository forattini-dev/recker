import { ClientOptions } from '../types/index.js';
import type { ClientOptionsWithAI, PresetAIConfig } from '../types/ai-client.js';

export interface XAIPresetOptions {
  apiKey: string;
  /** Default model for chat completions @default 'grok-4.1' */
  model?: string;
}

/**
 * xAI (Grok) preset
 * @see https://docs.x.ai/
 */
export function xai(options: XAIPresetOptions): ClientOptions & ClientOptionsWithAI {
  const _aiConfig: PresetAIConfig = {
    provider: 'xai',
    apiKey: options.apiKey,
    model: options.model ?? 'grok-4.1',
    memory: { maxPairs: 12 },
  };

  return {
    baseUrl: 'https://api.x.ai/v1',
    headers: {
      'Authorization': `Bearer ${options.apiKey}`,
    },
    timeout: 5 * 60 * 1000,
    retry: {
      maxAttempts: 3,
      backoff: 'exponential',
      delay: 1000,
      statusCodes: [408, 429, 500, 502, 503, 504]
    },
    _aiConfig,
  };
}

/**
 * Grok preset (alias for xai)
 * @see https://docs.x.ai/
 */
export const grok = xai;
