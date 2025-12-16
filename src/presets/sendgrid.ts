import { ClientOptions } from '../types/index.js';

export interface SendGridPresetOptions {
  /**
   * SendGrid API key (starts with 'SG.')
   */
  apiKey: string;
}

/**
 * SendGrid Email API preset
 *
 * Particularities:
 * - Aggressive rate limits on free tier
 * - Returns 429 with specific error codes for rate limiting
 * - Email sending can be slow (up to 30s for large batches)
 * - Supports batch sending up to 1000 recipients
 *
 * @see https://docs.sendgrid.com/api-reference/mail-send/mail-send
 *
 * @example
 * ```typescript
 * const client = createClient(sendgrid({ apiKey: 'SG.xxx' }));
 *
 * // Send email
 * await client.post('/mail/send', {
 *   json: {
 *     personalizations: [{ to: [{ email: 'user@example.com' }] }],
 *     from: { email: 'noreply@myapp.com' },
 *     subject: 'Hello!',
 *     content: [{ type: 'text/plain', value: 'Hello World!' }]
 *   }
 * });
 *
 * // Get templates
 * await client.get('/templates').json();
 * ```
 */
export function sendgrid(options: SendGridPresetOptions): ClientOptions {
  return {
    baseUrl: 'https://api.sendgrid.com/v3',
    headers: {
      'Authorization': `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
    },
    timeout: 60 * 1000, // 60s for large batch sends
    retry: {
      maxAttempts: 3,
      backoff: 'exponential',
      delay: 2000, // Longer delay due to aggressive rate limits
      statusCodes: [408, 429, 500, 502, 503, 504],
    }
  };
}

/**
 * SendGrid Mail Send preset (optimized for email sending)
 */
export const sendgridMail = (options: SendGridPresetOptions): ClientOptions => ({
  ...sendgrid(options),
  baseUrl: 'https://api.sendgrid.com/v3/mail',
});
