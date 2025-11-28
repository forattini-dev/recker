import { ClientOptions } from '../types/index.js';

export interface XAIPresetOptions {
  apiKey: string;
}

/**
 * xAI (Grok) preset
 * @see https://docs.x.ai/
 */
export function xai(options: XAIPresetOptions): ClientOptions {
  return {
    baseUrl: 'https://api.x.ai/v1',
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

/**
 * Grok preset (alias for xai)
 * @see https://docs.x.ai/
 */
export const grok = xai;
