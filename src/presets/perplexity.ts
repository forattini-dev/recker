import { ClientOptions } from '../types/index.js';

export interface PerplexityPresetOptions {
  apiKey: string;
}

/**
 * Perplexity AI preset
 * @see https://docs.perplexity.ai/
 */
export function perplexity(options: PerplexityPresetOptions): ClientOptions {
  return {
    baseUrl: 'https://api.perplexity.ai',
    headers: {
      'Authorization': `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
    },
    timeout: 5 * 60 * 1000,
    retry: {
      maxAttempts: 3,
      backoff: 'exponential',
      delay: 1000,
      statusCodes: [408, 429, 500, 502, 503, 504]
    }
  };
}
