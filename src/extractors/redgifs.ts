/**
 * RedGifs Extractor
 *
 * Extracts video information from RedGifs.
 * Adult GIF/video hosting platform.
 *
 * @example
 * ```typescript
 * const extractor = new RedGifsExtractor(client);
 * const info = await extractor.extract('https://redgifs.com/watch/gifid');
 * ```
 */

import {
  BaseExtractor,
  ExtractorResult,
  ExtractorError,
  Format,
} from './base.js';

interface RedGifsGif {
  id: string;
  createDate: number;
  hasAudio: boolean;
  width: number;
  height: number;
  likes: number;
  tags: string[];
  verified: boolean;
  views: number;
  duration: number;
  published: boolean;
  type: number;
  urls: {
    poster?: string;
    thumbnail?: string;
    vthumbnail?: string;
    hd?: string;
    sd?: string;
    gif?: string;
  };
  userName?: string;
  description?: string;
}

interface RedGifsResponse {
  gif: RedGifsGif;
}

export class RedGifsExtractor extends BaseExtractor {
  readonly VALID_URL = [
    // Watch URLs
    /https?:\/\/(?:www\.)?redgifs\.com\/watch\/(?<id>[a-zA-Z]+)/,
    // Direct URLs
    /https?:\/\/(?:www\.)?redgifs\.com\/ifr\/(?<ifr_id>[a-zA-Z]+)/,
    // Old gfycat format
    /https?:\/\/(?:[a-z]+\.)?redgifs\.com\/(?<old_id>[a-zA-Z]+)(?:\.gif|\.mp4)?$/,
  ];
  readonly IE_NAME = 'redgifs';
  readonly AGE_LIMIT = 18;

  private accessToken: string | null = null;

  async extract(url: string): Promise<ExtractorResult> {
    const gifId = this.extractGifId(url);

    if (!gifId) {
      throw new ExtractorError('Could not extract GIF ID from URL');
    }

    // Get access token
    await this.ensureAccessToken();

    // Fetch GIF data
    const gif = await this.getGifData(gifId);

    if (!gif) {
      throw new ExtractorError('Could not fetch GIF data');
    }

    const formats = this.buildFormats(gif);

    if (formats.length === 0) {
      throw new ExtractorError('No playable formats found');
    }

    return {
      id: gifId,
      title: gif.description || gif.tags?.join(', ') || `RedGifs ${gifId}`,
      uploader: gif.userName,
      thumbnail: gif.urls.poster || gif.urls.thumbnail,
      duration: gif.duration,
      viewCount: gif.views,
      likeCount: gif.likes,
      isLive: false,
      formats,
    };
  }

  /**
   * Extract GIF ID from URL
   */
  private extractGifId(url: string): string | null {
    // Normalize to lowercase (RedGifs IDs are case-insensitive)
    const match = url.match(/redgifs\.com\/(?:watch|ifr)\/([a-zA-Z]+)/i) ||
                  url.match(/redgifs\.com\/([a-zA-Z]+)(?:\.gif|\.mp4)?$/i);

    return match?.[1]?.toLowerCase() || null;
  }

  /**
   * Ensure we have an access token
   */
  private async ensureAccessToken(): Promise<void> {
    if (this.accessToken) return;

    try {
      const response = await this.client.get(
        'https://api.redgifs.com/v2/auth/temporary',
        {
          headers: this.getHeaders(),
        }
      ).json<{ token: string }>();

      this.accessToken = response.token;
    } catch {
      throw new ExtractorError('Could not obtain access token');
    }
  }

  /**
   * Get GIF data from API
   */
  private async getGifData(gifId: string): Promise<RedGifsGif | null> {
    try {
      const response = await this.client.get(
        `https://api.redgifs.com/v2/gifs/${gifId}`,
        {
          headers: {
            ...this.getHeaders(),
            'Authorization': `Bearer ${this.accessToken}`,
          },
        }
      ).json<RedGifsResponse>();

      return response.gif;
    } catch {
      return null;
    }
  }

  /**
   * Build format list
   */
  private buildFormats(gif: RedGifsGif): Format[] {
    const formats: Format[] = [];

    // HD version
    if (gif.urls.hd) {
      formats.push({
        url: gif.urls.hd,
        formatId: 'hd',
        ext: 'mp4',
        protocol: 'https',
        width: gif.width,
        height: gif.height,
      });
    }

    // SD version
    if (gif.urls.sd) {
      formats.push({
        url: gif.urls.sd,
        formatId: 'sd',
        ext: 'mp4',
        protocol: 'https',
      });
    }

    // GIF version
    if (gif.urls.gif) {
      formats.push({
        url: gif.urls.gif,
        formatId: 'gif',
        ext: 'gif',
        protocol: 'https',
        width: gif.width,
        height: gif.height,
      });
    }

    // Video thumbnail (preview)
    if (gif.urls.vthumbnail) {
      formats.push({
        url: gif.urls.vthumbnail,
        formatId: 'thumbnail',
        ext: 'mp4',
        protocol: 'https',
      });
    }

    // Sort by quality (HD first)
    formats.sort((a, b) => {
      const order: Record<string, number> = { 'hd': 0, 'sd': 1, 'gif': 2, 'thumbnail': 3 };
      return (order[a.formatId] || 99) - (order[b.formatId] || 99);
    });

    return formats;
  }

  /**
   * Get request headers
   */
  private getHeaders(): Record<string, string> {
    return {
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.5',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Origin': 'https://www.redgifs.com',
      'Referer': 'https://www.redgifs.com/',
    };
  }
}
