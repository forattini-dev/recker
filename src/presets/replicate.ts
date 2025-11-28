import { ClientOptions } from '../types/index.js';

export interface ReplicatePresetOptions {
  apiKey: string;
}

/**
 * Replicate AI preset
 * @see https://replicate.com/docs
 */
export function replicate(options: ReplicatePresetOptions): ClientOptions {
  return {
    baseUrl: 'https://api.replicate.com/v1',
    headers: {
      'Authorization': `Token ${options.apiKey}`,
      'Content-Type': 'application/json',
    },
    // Replicate can take a while for model cold starts
    timeout: 15 * 60 * 1000,
    retry: {
      maxAttempts: 3,
      backoff: 'exponential',
      delay: 2000,
      statusCodes: [408, 429, 500, 502, 503, 504]
    }
  };
}
