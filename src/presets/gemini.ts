import { ClientOptions } from '../types/index.js';

export interface GeminiPresetOptions {
  apiKey: string;
}

/**
 * Google Gemini (Generative AI) preset
 * @see https://ai.google.dev/docs
 */
export function gemini(options: GeminiPresetOptions): ClientOptions {
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
    }
  };
}
