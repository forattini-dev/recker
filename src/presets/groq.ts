import { ClientOptions } from '../types/index.js';
import type { ClientOptionsWithAI, PresetAIConfig } from '../types/ai-client.js';

export interface GroqPresetOptions {
  apiKey: string;
  /** Default model for chat completions @default 'llama-3.3-70b-versatile' */
  model?: string;
}

/**
 * Groq Cloud preset (fast inference)
 * @see https://console.groq.com/docs
 */
export function groq(options: GroqPresetOptions): ClientOptions & ClientOptionsWithAI {
  const _aiConfig: PresetAIConfig = {
    provider: 'groq',
    apiKey: options.apiKey,
    model: options.model ?? 'llama-3.3-70b-versatile',
    memory: { maxPairs: 12 },
  };

  return {
    baseUrl: 'https://api.groq.com/openai/v1',
    headers: {
      'Authorization': `Bearer ${options.apiKey}`,
    },
    // Groq is fast, shorter timeout
    timeout: 2 * 60 * 1000,
    retry: {
      maxAttempts: 3,
      backoff: 'exponential',
      delay: 500,
      statusCodes: [408, 429, 500, 502, 503, 504]
    },
    _aiConfig,
  };
}
