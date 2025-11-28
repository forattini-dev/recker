import { ClientOptions } from '../types/index.js';

export interface GitLabPresetOptions {
  /**
   * Personal access token or OAuth token
   */
  token: string;
  /**
   * GitLab instance URL (default: 'https://gitlab.com')
   */
  baseUrl?: string;
}

/**
 * GitLab API preset
 * @see https://docs.gitlab.com/ee/api/rest/
 */
export function gitlab(options: GitLabPresetOptions): ClientOptions {
  return {
    baseUrl: `${options.baseUrl || 'https://gitlab.com'}/api/v4`,
    headers: {
      'PRIVATE-TOKEN': options.token,
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
