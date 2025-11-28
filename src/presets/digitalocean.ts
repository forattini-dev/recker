import { ClientOptions } from '../types/index.js';

export interface DigitalOceanPresetOptions {
  /**
   * DigitalOcean API token
   */
  token: string;
}

/**
 * DigitalOcean API preset
 * @see https://docs.digitalocean.com/reference/api/
 */
export function digitalocean(options: DigitalOceanPresetOptions): ClientOptions {
  return {
    baseUrl: 'https://api.digitalocean.com/v2',
    headers: {
      'Authorization': `Bearer ${options.token}`,
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
