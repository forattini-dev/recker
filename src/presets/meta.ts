import { ClientOptions } from '../types/index.js';

export interface MetaPresetOptions {
  /**
   * Meta Access Token
   * Get one at: https://developers.facebook.com/tools/explorer/
   */
  accessToken: string;
  /**
   * Graph API version (e.g., 'v19.0')
   * @default 'v19.0'
   */
  version?: string;
}

/**
 * Meta Graph API preset
 * Works with Facebook, Instagram, WhatsApp, and Threads
 * @see https://developers.facebook.com/docs/graph-api/
 *
 * @example
 * ```typescript
 * import { meta } from 'recker/presets';
 *
 * const client = createClient(meta({
 *   accessToken: process.env.META_ACCESS_TOKEN
 * }));
 *
 * // Get user profile
 * const me = await client.get('/me', {
 *   params: { fields: 'id,name,email,picture' }
 * }).json();
 *
 * // Get user's pages
 * const pages = await client.get('/me/accounts').json();
 *
 * // Post to a page
 * await client.post('/:pageId/feed', {
 *   params: { pageId: '123456789' },
 *   form: {
 *     message: 'Hello from Recker!',
 *     access_token: pageAccessToken
 *   }
 * });
 *
 * // Get page insights
 * const insights = await client.get('/:pageId/insights', {
 *   params: {
 *     pageId: '123456789',
 *     metric: 'page_impressions,page_engaged_users',
 *     period: 'day'
 *   }
 * }).json();
 * ```
 */
export function meta(options: MetaPresetOptions): ClientOptions {
  const version = options.version ?? 'v19.0';

  return {
    baseUrl: `https://graph.facebook.com/${version}`,
    headers: {
      'Content-Type': 'application/json',
    },
    defaults: {
      params: {
        access_token: options.accessToken
      }
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

/**
 * Facebook Graph API preset (alias for meta)
 * @see https://developers.facebook.com/docs/graph-api/
 */
export function facebook(options: MetaPresetOptions): ClientOptions {
  return meta(options);
}

/**
 * Instagram Graph API preset (via Meta)
 * @see https://developers.facebook.com/docs/instagram-api/
 */
export function instagram(options: MetaPresetOptions): ClientOptions {
  return meta(options);
}

/**
 * WhatsApp Business API preset (via Meta)
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/
 */
export function whatsapp(options: MetaPresetOptions): ClientOptions {
  return meta(options);
}

/**
 * Threads API preset (via Meta)
 * @see https://developers.facebook.com/docs/threads/
 */
export function threads(options: MetaPresetOptions): ClientOptions {
  return meta(options);
}
