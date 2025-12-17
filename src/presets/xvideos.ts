import { ClientOptions } from '../types/index.js';

/**
 * XVideos preset for video extraction
 *
 * Configures the client with appropriate headers and settings
 * for accessing XVideos.com
 *
 * @example
 * ```typescript
 * const client = createClient(xvideos());
 * ```
 */
export default function xvideos(): ClientOptions {
  return {
    useCurl: true,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      Referer: 'https://www.xvideos.com/',
      Origin: 'https://www.xvideos.com',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      Connection: 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    },
  };
}
