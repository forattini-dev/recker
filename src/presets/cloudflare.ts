import { ClientOptions } from '../types/index.js';

export interface CloudflarePresetOptions {
  /**
   * Cloudflare API Token (recommended)
   * @see https://dash.cloudflare.com/profile/api-tokens
   */
  apiToken?: string;
  /**
   * Legacy: API Key + Email authentication
   */
  apiKey?: string;
  email?: string;
}

/**
 * Cloudflare API preset
 * @see https://developers.cloudflare.com/api/
 */
export function cloudflare(options: CloudflarePresetOptions): ClientOptions {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (options.apiToken) {
    headers['Authorization'] = `Bearer ${options.apiToken}`;
  } else if (options.apiKey && options.email) {
    headers['X-Auth-Key'] = options.apiKey;
    headers['X-Auth-Email'] = options.email;
  }

  return {
    baseUrl: 'https://api.cloudflare.com/client/v4',
    headers,
    timeout: 30 * 1000,
    retry: {
      maxAttempts: 3,
      backoff: 'exponential',
      delay: 1000,
      statusCodes: [408, 429, 500, 502, 503, 504]
    }
  };
}

export interface CloudflareWorkersAIPresetOptions {
  accountId: string;
  apiToken: string;
}

/**
 * Cloudflare Workers AI preset
 * @see https://developers.cloudflare.com/workers-ai/
 */
export function cloudflareWorkersAI(options: CloudflareWorkersAIPresetOptions): ClientOptions {
  return {
    baseUrl: `https://api.cloudflare.com/client/v4/accounts/${options.accountId}/ai`,
    headers: {
      'Authorization': `Bearer ${options.apiToken}`,
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
