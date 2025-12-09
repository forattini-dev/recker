import { ClientOptions } from '../types/index.js';
import type { ClientOptionsWithAI, PresetAIConfig } from '../types/ai-client.js';

export interface GeminiPresetOptions {
  apiKey: string;
  /** Default model for chat completions @default 'gemini-3-pro' */
  model?: string;
}

/**
 * Google Gemini (Generative AI) preset
 * @see https://ai.google.dev/docs
 */
export function gemini(options: GeminiPresetOptions): ClientOptions & ClientOptionsWithAI {
  const _aiConfig: PresetAIConfig = {
    provider: 'google',
    apiKey: options.apiKey,
    model: options.model ?? 'gemini-3-pro',
    memory: { maxPairs: 12 },
  };

  return {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': options.apiKey,
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
