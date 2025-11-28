import { ClientOptions } from '../types/index.js';

export interface AnthropicPresetOptions {
  apiKey: string;
  version?: string;
}

export function anthropic(options: AnthropicPresetOptions): ClientOptions {
  return {
    baseUrl: 'https://api.anthropic.com/v1',
    headers: {
      'x-api-key': options.apiKey,
      'anthropic-version': options.version || '2023-06-01',
      'content-type': 'application/json'
    },
    timeout: 10 * 60 * 1000, // 10 minutes (600_000ms)
    retry: {
      maxAttempts: 5,
      backoff: 'exponential',
      delay: 1000,
      // Anthropic is sensitive to overload
      statusCodes: [408, 429, 500, 502, 503, 504]
    }
  };
}
