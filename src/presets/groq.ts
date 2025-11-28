import { ClientOptions } from '../types/index.js';

export interface GroqPresetOptions {
  apiKey: string;
}

/**
 * Groq Cloud preset (fast inference)
 * @see https://console.groq.com/docs
 */
export function groq(options: GroqPresetOptions): ClientOptions {
  return {
    baseUrl: 'https://api.groq.com/openai/v1',
    headers: {
      'Authorization': `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
    },
    // Groq is fast, shorter timeout
    timeout: 2 * 60 * 1000,
    retry: {
      maxAttempts: 3,
      backoff: 'exponential',
      delay: 500,
      statusCodes: [408, 429, 500, 502, 503, 504]
    }
  };
}
