import { ClientOptions } from '../types/index.js';

export interface VercelPresetOptions {
  /**
   * Vercel API token
   */
  token: string;
  /**
   * Team ID (optional, for team-scoped requests)
   */
  teamId?: string;
}

/**
 * Vercel API preset
 * @see https://vercel.com/docs/rest-api
 */
export function vercel(options: VercelPresetOptions): ClientOptions {
  const params: Record<string, string> = {};
  if (options.teamId) {
    params.teamId = options.teamId;
  }

  return {
    baseUrl: 'https://api.vercel.com',
    headers: {
      'Authorization': `Bearer ${options.token}`,
      'Content-Type': 'application/json',
    },
    defaults: {
      params,
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
