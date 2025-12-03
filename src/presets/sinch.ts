import { ClientOptions } from '../types/index.js';

export interface SinchPresetOptions {
  /**
   * Sinch Project ID
   */
  projectId: string;
  /**
   * Sinch Key ID
   */
  keyId: string;
  /**
   * Sinch Key Secret
   */
  keySecret: string;
  /**
   * API product: 'sms', 'voice', 'conversation', 'numbers', 'verification'
   * @default 'sms'
   */
  product?: 'sms' | 'voice' | 'conversation' | 'numbers' | 'verification';
  /**
   * Region for SMS API: 'us', 'eu', 'au', 'br', 'ca'
   * @default 'us'
   */
  region?: 'us' | 'eu' | 'au' | 'br' | 'ca';
}

const SMS_REGIONS: Record<string, string> = {
  us: 'https://us.sms.api.sinch.com',
  eu: 'https://eu.sms.api.sinch.com',
  au: 'https://au.sms.api.sinch.com',
  br: 'https://br.sms.api.sinch.com',
  ca: 'https://ca.sms.api.sinch.com',
};

const PRODUCT_URLS: Record<string, string> = {
  voice: 'https://calling.api.sinch.com',
  conversation: 'https://us.conversation.api.sinch.com',
  numbers: 'https://numbers.api.sinch.com',
  verification: 'https://verification.api.sinch.com',
};

/**
 * Sinch API preset
 * @see https://developers.sinch.com/docs/
 */
export function sinch(options: SinchPresetOptions): ClientOptions {
  const credentials = Buffer.from(`${options.keyId}:${options.keySecret}`).toString('base64');
  const product = options.product ?? 'sms';
  const region = options.region ?? 'us';

  let baseUrl: string;
  if (product === 'sms') {
    baseUrl = `${SMS_REGIONS[region]}/xms/v1/${options.projectId}`;
  } else {
    baseUrl = `${PRODUCT_URLS[product]}/v1/projects/${options.projectId}`;
  }

  return {
    baseUrl,
    headers: {
      'Authorization': `Basic ${credentials}`,
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
