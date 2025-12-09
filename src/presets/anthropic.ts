import { ClientOptions } from '../types/index.js';
import type { ClientOptionsWithAI, PresetAIConfig } from '../types/ai-client.js';

export interface AnthropicPresetOptions {
  apiKey: string;
  version?: string;
  /** Default model for chat completions @default 'claude-sonnet-4-5' */
  model?: string;
}

export function anthropic(options: AnthropicPresetOptions): ClientOptions & ClientOptionsWithAI {
  const _aiConfig: PresetAIConfig = {
    provider: 'anthropic',
    apiKey: options.apiKey,
    model: options.model ?? 'claude-sonnet-4-5',
    headers: {
      'anthropic-version': options.version || '2023-06-01',
    },
    memory: { maxPairs: 12 },
  };

  return {
    baseUrl: 'https://api.anthropic.com/v1',
    headers: {
      'x-api-key': options.apiKey,
      'anthropic-version': options.version || '2023-06-01',
      'content-type': 'application/json'
    },
    timeout: 10 * 60 * 1000, // 10 minutes (600_000ms)
    retry: {
      maxAttempts: 5,
      backoff: 'exponential',
      delay: 1000,
      // Anthropic is sensitive to overload
      statusCodes: [408, 429, 500, 502, 503, 504]
    },
    _aiConfig,
  };
}
