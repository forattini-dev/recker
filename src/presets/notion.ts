import { ClientOptions } from '../types/index.js';

export interface NotionPresetOptions {
  /**
   * Notion integration token
   */
  token: string;
  /**
   * Notion API version (default: '2022-06-28')
   */
  notionVersion?: string;
}

/**
 * Notion API preset
 * @see https://developers.notion.com/
 */
export function notion(options: NotionPresetOptions): ClientOptions {
  return {
    baseUrl: 'https://api.notion.com/v1',
    headers: {
      'Authorization': `Bearer ${options.token}`,
      'Content-Type': 'application/json',
      'Notion-Version': options.notionVersion || '2022-06-28',
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
