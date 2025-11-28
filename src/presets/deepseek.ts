import { ClientOptions } from '../types/index.js';

export interface DeepSeekPresetOptions {
  apiKey: string;
}

/**
 * DeepSeek AI preset
 * @see https://platform.deepseek.com/docs
 */
export function deepseek(options: DeepSeekPresetOptions): ClientOptions {
  return {
    baseUrl: 'https://api.deepseek.com/v1',
    headers: {
      'Authorization': `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
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
