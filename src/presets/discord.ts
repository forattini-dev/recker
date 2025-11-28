import { ClientOptions } from '../types/index.js';

export interface DiscordPresetOptions {
  /**
   * Discord Bot token
   */
  token: string;
  /**
   * Token type: 'Bot' (default) or 'Bearer' (for OAuth2)
   */
  tokenType?: 'Bot' | 'Bearer';
}

/**
 * Discord API preset
 * @see https://discord.com/developers/docs/intro
 */
export function discord(options: DiscordPresetOptions): ClientOptions {
  const tokenType = options.tokenType || 'Bot';

  return {
    baseUrl: 'https://discord.com/api/v10',
    headers: {
      'Authorization': `${tokenType} ${options.token}`,
      'Content-Type': 'application/json',
    },
    timeout: 30 * 1000,
    retry: {
      maxAttempts: 5,
      backoff: 'exponential',
      delay: 1000,
      // Discord has aggressive rate limiting
      statusCodes: [408, 429, 500, 502, 503, 504]
    }
  };
}
