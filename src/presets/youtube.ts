import { ClientOptions } from '../types/index.js';

export interface YouTubePresetOptions {
  /**
   * YouTube Data API key
   * Get one at: https://console.cloud.google.com/apis/credentials
   */
  apiKey: string;
}

/**
 * YouTube Data API v3 preset
 * @see https://developers.google.com/youtube/v3/docs
 *
 * @example
 * ```typescript
 * import { youtube } from 'recker/presets';
 *
 * const client = createClient(youtube({
 *   apiKey: process.env.YOUTUBE_API_KEY
 * }));
 *
 * // Search videos
 * const results = await client.get('/search', {
 *   params: {
 *     part: 'snippet',
 *     q: 'nodejs tutorial',
 *     type: 'video',
 *     maxResults: 10
 *   }
 * }).json();
 *
 * // Get video details
 * const video = await client.get('/videos', {
 *   params: {
 *     part: 'snippet,statistics',
 *     id: 'dQw4w9WgXcQ'
 *   }
 * }).json();
 *
 * // Get channel info
 * const channel = await client.get('/channels', {
 *   params: {
 *     part: 'snippet,statistics',
 *     id: 'UC_x5XG1OV2P6uZZ5FSM9Ttw'
 *   }
 * }).json();
 *
 * // Get playlist items
 * const playlist = await client.get('/playlistItems', {
 *   params: {
 *     part: 'snippet',
 *     playlistId: 'PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf',
 *     maxResults: 50
 *   }
 * }).json();
 * ```
 */
export function youtube(options: YouTubePresetOptions): ClientOptions {
  return {
    baseUrl: 'https://www.googleapis.com/youtube/v3',
    headers: {
      'Accept': 'application/json',
    },
    defaults: {
      params: {
        key: options.apiKey
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
