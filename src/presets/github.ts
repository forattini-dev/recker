import { ClientOptions } from '../types/index.js';

export interface GitHubPresetOptions {
  /**
   * Personal access token or GitHub App token
   */
  token: string;
  /**
   * API version (default: '2022-11-28')
   */
  apiVersion?: string;
}

/**
 * GitHub API preset
 * @see https://docs.github.com/en/rest
 */
export function github(options: GitHubPresetOptions): ClientOptions {
  return {
    baseUrl: 'https://api.github.com',
    headers: {
      'Authorization': `Bearer ${options.token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': options.apiVersion || '2022-11-28',
    },
    timeout: 30 * 1000,
    retry: {
      maxAttempts: 3,
      backoff: 'exponential',
      delay: 1000,
      // GitHub has specific rate limiting
      statusCodes: [408, 429, 500, 502, 503, 504]
    }
  };
}
