import { ClientOptions } from '../types/index.js';
import type { ClientOptionsWithAI, PresetAIConfig } from '../types/ai-client.js';

export interface PerplexityPresetOptions {
  apiKey: string;
  /** Default model for chat completions @default 'sonar-pro' */
  model?: string;
}

/**
 * Perplexity AI preset
 * @see https://docs.perplexity.ai/
 */
export function perplexity(options: PerplexityPresetOptions): ClientOptions & ClientOptionsWithAI {
  const _aiConfig: PresetAIConfig = {
    provider: 'perplexity',
    apiKey: options.apiKey,
    model: options.model ?? 'sonar-pro',
    memory: { maxPairs: 12 },
  };

  return {
    baseUrl: 'https://api.perplexity.ai',
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
