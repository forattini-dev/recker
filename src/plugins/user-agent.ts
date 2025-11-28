import { Plugin } from '../types/index.js';

const DEFAULT_UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/121.0'
];

export interface UserAgentOptions {
  userAgents?: string[];
  strategy?: 'random' | 'round-robin';
}

export function userAgentRotator(options: UserAgentOptions = {}): Plugin {
  const uas = options.userAgents || DEFAULT_UAS;
  let index = 0;

  return (client: any) => {
    client.beforeRequest((req: any) => {
      let selected;
      if (options.strategy === 'round-robin') {
        selected = uas[index];
        index = (index + 1) % uas.length;
      } else {
        selected = uas[Math.floor(Math.random() * uas.length)];
      }
      
      req.headers.set('User-Agent', selected);
    });
  };
}

/**
 * Helper to generate standard browser headers
 * Useful to bypass basic bot protection
 */
export function browserHeaders(platform: 'desktop' | 'mobile' = 'desktop'): Record<string, string> {
  return {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    ...(platform === 'desktop' ? {
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"'
    } : {
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120"',
        'Sec-Ch-Ua-Mobile': '?1',
        'Sec-Ch-Ua-Platform': '"Android"'
    })
  };
}
