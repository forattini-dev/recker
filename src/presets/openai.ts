import { ClientOptions } from '../types/index.js';
import type { ClientOptionsWithAI, PresetAIConfig } from '../types/ai-client.js';

export interface OpenAIPresetOptions {
  apiKey: string;
  organization?: string;
  project?: string;
  /** Default model for chat completions @default 'gpt-5.1' */
  model?: string;
}

export function openai(options: OpenAIPresetOptions): ClientOptions & ClientOptionsWithAI {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${options.apiKey}`,
  };

  if (options.organization) {
    headers['OpenAI-Organization'] = options.organization;
  }

  if (options.project) {
    headers['OpenAI-Project'] = options.project;
  }

  const _aiConfig: PresetAIConfig = {
    provider: 'openai',
    apiKey: options.apiKey,
    model: options.model ?? 'gpt-5.1',
    organization: options.organization,
    memory: { maxPairs: 12 },
  };

  return {
    baseUrl: 'https://api.openai.com/v1',
    headers,
    // OpenAI requires long timeouts and robust retries
    timeout: 10 * 60 * 1000, // 10 minutes (600_000ms)
    retry: {
      maxAttempts: 5,
      backoff: 'exponential',
      delay: 1000,
      statusCodes: [408, 409, 429, 500, 502, 503, 504]
    },
    _aiConfig,
  };
}
