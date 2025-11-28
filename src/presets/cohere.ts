import { ClientOptions } from '../types/index.js';

export interface CoherePresetOptions {
  apiKey: string;
}

/**
 * Cohere AI preset
 * @see https://docs.cohere.com/
 */
export function cohere(options: CoherePresetOptions): ClientOptions {
  return {
    baseUrl: 'https://api.cohere.ai/v1',
    headers: {
      'Authorization': `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
    },
    timeout: 5 * 60 * 1000,
    retry: {
      maxAttempts: 5,
      backoff: 'exponential',
      delay: 1000,
      statusCodes: [408, 429, 500, 502, 503, 504]
    }
  };
}
