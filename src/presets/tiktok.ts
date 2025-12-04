import { ClientOptions } from '../types/index.js';

export interface TikTokPresetOptions {
  /**
   * TikTok Access Token
   * Get one via OAuth: https://developers.tiktok.com/
   */
  accessToken: string;
}

/**
 * TikTok API preset
 * @see https://developers.tiktok.com/doc/overview/
 *
 * @example
 * ```typescript
 * import { tiktok } from 'recker/presets';
 *
 * const client = createClient(tiktok({
 *   accessToken: process.env.TIKTOK_ACCESS_TOKEN
 * }));
 *
 * // Get user info
 * const user = await client.get('/user/info/', {
 *   params: { fields: 'open_id,union_id,avatar_url,display_name' }
 * }).json();
 *
 * // Get user's videos
 * const videos = await client.post('/video/list/', {
 *   json: {
 *     max_count: 20
 *   }
 * }).json();
 *
 * // Query video info
 * const videoInfo = await client.post('/video/query/', {
 *   json: {
 *     filters: {
 *       video_ids: ['video_id_1', 'video_id_2']
 *     }
 *   }
 * }).json();
 * ```
 */
export function tiktok(options: TikTokPresetOptions): ClientOptions {
  return {
    baseUrl: 'https://open.tiktokapis.com/v2',
    headers: {
      'Authorization': `Bearer ${options.accessToken}`,
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

export interface TikTokBusinessPresetOptions {
  /**
   * TikTok Business Access Token
   */
  accessToken: string;
  /**
   * Advertiser ID (for Ads API)
   */
  advertiserId?: string;
}

/**
 * TikTok Business/Ads API preset
 * @see https://business-api.tiktok.com/portal/docs
 *
 * @example
 * ```typescript
 * import { tiktokBusiness } from 'recker/presets';
 *
 * const client = createClient(tiktokBusiness({
 *   accessToken: process.env.TIKTOK_BUSINESS_TOKEN,
 *   advertiserId: process.env.TIKTOK_ADVERTISER_ID
 * }));
 *
 * // Get advertiser info
 * const info = await client.get('/advertiser/info/', {
 *   params: { advertiser_ids: ['advertiser_id'] }
 * }).json();
 *
 * // Get campaigns
 * const campaigns = await client.get('/campaign/get/', {
 *   params: { advertiser_id: 'advertiser_id' }
 * }).json();
 * ```
 */
export function tiktokBusiness(options: TikTokBusinessPresetOptions): ClientOptions {
  const headers: Record<string, string> = {
    'Access-Token': options.accessToken,
    'Content-Type': 'application/json',
  };

  return {
    baseUrl: 'https://business-api.tiktok.com/open_api/v1.3',
    headers,
    defaults: options.advertiserId ? {
      params: {
        advertiser_id: options.advertiserId
      }
    } : undefined,
    timeout: 30 * 1000,
    retry: {
      maxAttempts: 3,
      backoff: 'exponential',
      delay: 1000,
      statusCodes: [408, 429, 500, 502, 503, 504]
    }
  };
}
