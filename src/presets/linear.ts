import { ClientOptions } from '../types/index.js';

export interface LinearPresetOptions {
  /**
   * Linear API key
   */
  apiKey: string;
}

/**
 * Linear (issue tracking) GraphQL API preset
 * @see https://developers.linear.app/docs/graphql/working-with-the-graphql-api
 */
export function linear(options: LinearPresetOptions): ClientOptions {
  return {
    baseUrl: 'https://api.linear.app',
    headers: {
      'Authorization': options.apiKey,
      'Content-Type': 'application/json',
    },
    timeout: 30 * 1000,
    retry: {
      maxAttempts: 3,
      backoff: 'exponential',
      delay: 500,
      statusCodes: [408, 429, 500, 502, 503, 504]
    }
  };
}
