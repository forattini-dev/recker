import { ClientOptions } from '../types/index.js';

export interface SlackPresetOptions {
  /**
   * Slack Bot token (xoxb-...) or User token (xoxp-...)
   */
  token: string;
}

/**
 * Slack Web API preset
 * @see https://api.slack.com/web
 */
export function slack(options: SlackPresetOptions): ClientOptions {
  return {
    baseUrl: 'https://slack.com/api',
    headers: {
      'Authorization': `Bearer ${options.token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    timeout: 30 * 1000,
    retry: {
      maxAttempts: 3,
      backoff: 'exponential',
      delay: 1000,
      // Slack uses 429 for rate limiting
      statusCodes: [408, 429, 500, 502, 503, 504]
    }
  };
}
