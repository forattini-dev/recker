import { ClientOptions } from '../types/index.js';

/**
 * PornHub preset for video extraction
 *
 * Configures the client with appropriate headers and settings
 * for accessing PornHub.com
 *
 * @example
 * ```typescript
 * const client = createClient(pornhub());
 * ```
 */
export default function pornhub(): ClientOptions {
  return {
    useCurl: true,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      Referer: 'https://www.pornhub.com/',
      Origin: 'https://www.pornhub.com',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      Connection: 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      Cookie: 'age_verified=1; accessAgeDisclaimerPH=1; accessAgeDisclaimerUK=1; accessPH=1; platform=pc',
    },
  };
}
