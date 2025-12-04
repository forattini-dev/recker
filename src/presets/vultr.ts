import { ClientOptions } from '../types/index.js';

export interface VultrPresetOptions {
  /**
   * Vultr API key
   */
  apiKey: string;
}

/**
 * Vultr API preset
 * @see https://www.vultr.com/api/
 */
export function vultr(options: VultrPresetOptions): ClientOptions {
  return {
    baseUrl: 'https://api.vultr.com/v2',
    headers: {
      'Authorization': `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
    },
    timeout: 30 * 1000,
    retry: {
      maxAttempts: 3,
      backoff: 'exponential',
      delay: 1000,
      statusCodes: [408, 429, 500, 502, 503, 504]
    }
  };
}
