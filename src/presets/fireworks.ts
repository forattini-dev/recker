import { ClientOptions } from '../types/index.js';

export interface FireworksPresetOptions {
  apiKey: string;
}

/**
 * Fireworks AI preset
 * @see https://docs.fireworks.ai/
 */
export function fireworks(options: FireworksPresetOptions): ClientOptions {
  return {
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    headers: {
      'Authorization': `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
    },
    timeout: 5 * 60 * 1000,
    retry: {
      maxAttempts: 3,
      backoff: 'exponential',
      delay: 500,
      statusCodes: [408, 429, 500, 502, 503, 504]
    }
  };
}
