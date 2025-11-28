import { ClientOptions } from '../types/index.js';

export interface TwilioPresetOptions {
  /**
   * Twilio Account SID
   */
  accountSid: string;
  /**
   * Twilio Auth Token
   */
  authToken: string;
}

/**
 * Twilio API preset
 * @see https://www.twilio.com/docs/usage/api
 */
export function twilio(options: TwilioPresetOptions): ClientOptions {
  const credentials = Buffer.from(`${options.accountSid}:${options.authToken}`).toString('base64');

  return {
    baseUrl: `https://api.twilio.com/2010-04-01/Accounts/${options.accountSid}`,
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
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
