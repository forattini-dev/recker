import { ClientOptions } from '../types/index.js';

export interface TogetherPresetOptions {
  apiKey: string;
}

/**
 * Together AI preset
 * @see https://docs.together.ai/
 */
export function together(options: TogetherPresetOptions): ClientOptions {
  return {
    baseUrl: 'https://api.together.xyz/v1',
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
