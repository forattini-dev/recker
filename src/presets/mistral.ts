import { ClientOptions } from '../types/index.js';

export interface MistralPresetOptions {
  apiKey: string;
}

/**
 * Mistral AI preset
 * @see https://docs.mistral.ai/
 */
export function mistral(options: MistralPresetOptions): ClientOptions {
  return {
    baseUrl: 'https://api.mistral.ai/v1',
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
