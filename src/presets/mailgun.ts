import { ClientOptions } from '../types/index.js';

export interface MailgunPresetOptions {
  /**
   * Mailgun API key
   */
  apiKey: string;
  /**
   * Mailgun domain (e.g., 'mg.example.com')
   */
  domain?: string;
  /**
   * Region: 'us' (default) or 'eu'
   */
  region?: 'us' | 'eu';
}

/**
 * Mailgun API preset
 * @see https://documentation.mailgun.com/docs/mailgun/api-reference/openapi-final/tag/Messages/
 */
export function mailgun(options: MailgunPresetOptions): ClientOptions {
  const credentials = Buffer.from(`api:${options.apiKey}`).toString('base64');
  const baseHost = options.region === 'eu' ? 'api.eu.mailgun.net' : 'api.mailgun.net';
  const baseUrl = options.domain
    ? `https://${baseHost}/v3/${options.domain}`
    : `https://${baseHost}/v3`;

  return {
    baseUrl,
    headers: {
      'Authorization': `Basic ${credentials}`,
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
