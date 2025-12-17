/**
 * Mixcloud Extractor
 *
 * Extracts audio information from Mixcloud.
 * DJ mix and radio show platform.
 *
 * @example
 * ```typescript
 * const extractor = new MixcloudExtractor(client);
 * const info = await extractor.extract('https://mixcloud.com/user/mix-name/');
 * ```
 */

import {
  BaseExtractor,
  ExtractorResult,
  ExtractorError,
  Format,
} from './base.js';

interface MixcloudShow {
  slug: string;
  name: string;
  description?: string;
  owner: {
    username: string;
    displayName: string;
  };
  pictures?: {
    extra_large?: string;
    '1024wx1024h'?: string;
    large?: string;
  };
  audioLength: number;
  publishDate: string;
  playCount?: number;
  favoriteCount?: number;
  repostCount?: number;
  streamInfo?: {
    url: string;
    hlsUrl?: string;
    dashUrl?: string;
  };
}

export class MixcloudExtractor extends BaseExtractor {
  readonly VALID_URL = [
    // Standard show URLs
    /https?:\/\/(?:www\.)?mixcloud\.com\/(?<user>[^\/]+)\/(?<show>[^\/\?]+)\/?(?:\?.*)?$/,
    // Embed URLs
    /https?:\/\/(?:www\.)?mixcloud\.com\/widget\/iframe\/\?.*feed=(?<embed_feed>[^&]+)/,
  ];
  readonly IE_NAME = 'mixcloud';
  readonly AGE_LIMIT = 0;

  async extract(url: string): Promise<ExtractorResult> {
    // Extract show path
    const showPath = this.extractShowPath(url);

    if (!showPath) {
      throw new ExtractorError('Could not extract show path from URL');
    }

    // Fetch show data via GraphQL
    const show = await this.getShowData(showPath);

    if (!show) {
      throw new ExtractorError('Could not fetch show data');
    }

    // Get stream URL
    const streamInfo = await this.getStreamUrl(showPath);

    if (!streamInfo) {
      throw new ExtractorError('Could not get stream URL');
    }

    const formats: Format[] = [];

    // HLS stream
    if (streamInfo.hlsUrl) {
      formats.push({
        url: streamInfo.hlsUrl,
        formatId: 'hls',
        ext: 'm3u8',
        protocol: 'm3u8',
      });
    }

    // DASH stream
    if (streamInfo.dashUrl) {
      formats.push({
        url: streamInfo.dashUrl,
        formatId: 'dash',
        ext: 'mpd',
        protocol: 'mpd',
      });
    }

    // Direct stream
    if (streamInfo.url) {
      formats.push({
        url: streamInfo.url,
        formatId: 'stream',
        ext: 'm4a',
        protocol: 'https',
        acodec: 'aac',
      });
    }

    if (formats.length === 0) {
      throw new ExtractorError('No playable formats found');
    }

    return {
      id: show.slug,
      title: show.name,
      description: show.description,
      uploader: show.owner.displayName,
      uploaderId: show.owner.username,
      thumbnail: show.pictures?.extra_large || show.pictures?.large,
      duration: show.audioLength,
      viewCount: show.playCount,
      likeCount: show.favoriteCount,
      isLive: false,
      formats,
    };
  }

  /**
   * Extract show path from URL
   */
  private extractShowPath(url: string): string | null {
    // Standard URL
    const match = url.match(/mixcloud\.com\/([^\/]+)\/([^\/\?]+)/);
    if (match) {
      return `/${match[1]}/${match[2]}/`;
    }

    // Embed URL
    const embedMatch = url.match(/feed=([^&]+)/);
    if (embedMatch) {
      return decodeURIComponent(embedMatch[1]);
    }

    return null;
  }

  /**
   * Get show data via GraphQL
   */
  private async getShowData(showPath: string): Promise<MixcloudShow | null> {
    try {
      const query = `
        query CloudcastQuery($lookup: CloudcastLookup!) {
          cloudcast: cloudcastLookup(lookup: $lookup) {
            slug
            name
            description
            owner {
              username
              displayName
            }
            pictures {
              extraLarge
              large
            }
            audioLength
            publishDate
            plays
            favorites
            reposts
          }
        }
      `;

      const variables = {
        lookup: {
          username: showPath.split('/')[1],
          slug: showPath.split('/')[2],
        },
      };

      const response = await this.client.post(
        'https://app.mixcloud.com/graphql',
        {
          query,
          variables,
        },
        {
          headers: this.getHeaders(),
        }
      ).json<any>();

      const cloudcast = response.data?.cloudcast;
      if (!cloudcast) return null;

      return {
        slug: cloudcast.slug,
        name: cloudcast.name,
        description: cloudcast.description,
        owner: cloudcast.owner,
        pictures: {
          extra_large: cloudcast.pictures?.extraLarge,
          large: cloudcast.pictures?.large,
        },
        audioLength: cloudcast.audioLength,
        publishDate: cloudcast.publishDate,
        playCount: cloudcast.plays,
        favoriteCount: cloudcast.favorites,
        repostCount: cloudcast.reposts,
      };
    } catch {
      // Fallback to webpage extraction
      return this.extractFromWebpage(showPath);
    }
  }

  /**
   * Extract from webpage
   */
  private async extractFromWebpage(showPath: string): Promise<MixcloudShow | null> {
    try {
      const html = await this.downloadWebpage(`https://www.mixcloud.com${showPath}`);

      // Find JSON-LD data
      const ldMatch = html.match(/<script type="application\/ld\+json">(.+?)<\/script>/s);
      if (ldMatch) {
        const ld = JSON.parse(ldMatch[1]);
        if (ld['@type'] === 'MusicRecording') {
          return {
            slug: showPath.split('/')[2] || '',
            name: ld.name,
            description: ld.description,
            owner: {
              username: ld.byArtist?.url?.split('/')[3] || '',
              displayName: ld.byArtist?.name || '',
            },
            pictures: {
              extra_large: ld.thumbnailUrl,
            },
            audioLength: this.parseIsoDuration(ld.duration),
            publishDate: ld.datePublished,
          };
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get stream URL
   */
  private async getStreamUrl(showPath: string): Promise<{ url: string; hlsUrl?: string; dashUrl?: string } | null> {
    try {
      // Try to get stream info via API
      const query = `
        query StreamQuery($lookup: CloudcastLookup!) {
          cloudcast: cloudcastLookup(lookup: $lookup) {
            streamInfo {
              hlsUrl
              dashUrl
              url
            }
          }
        }
      `;

      const variables = {
        lookup: {
          username: showPath.split('/')[1],
          slug: showPath.split('/')[2],
        },
      };

      const response = await this.client.post(
        'https://app.mixcloud.com/graphql',
        {
          query,
          variables,
        },
        {
          headers: this.getHeaders(),
        }
      ).json<any>();

      const streamInfo = response.data?.cloudcast?.streamInfo;
      if (streamInfo) {
        return {
          url: this.decodeStreamUrl(streamInfo.url),
          hlsUrl: streamInfo.hlsUrl ? this.decodeStreamUrl(streamInfo.hlsUrl) : undefined,
          dashUrl: streamInfo.dashUrl ? this.decodeStreamUrl(streamInfo.dashUrl) : undefined,
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Decode obfuscated stream URL
   * Mixcloud uses a simple XOR cipher with a key
   */
  private decodeStreamUrl(encoded: string): string {
    if (!encoded || encoded.startsWith('http')) {
      return encoded;
    }

    const key = 'IFYOUWANTTHEARTI';
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');

    let result = '';
    for (let i = 0; i < decoded.length; i++) {
      result += String.fromCharCode(
        decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length)
      );
    }

    return result;
  }

  /**
   * Parse ISO 8601 duration to seconds
   */
  private parseIsoDuration(duration?: string): number {
    if (!duration) return 0;

    // PT1H30M45S format
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;

    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const seconds = parseInt(match[3] || '0', 10);

    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Get request headers
   */
  private getHeaders(): Record<string, string> {
    return {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Accept-Language': 'en-US,en;q=0.5',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Origin': 'https://www.mixcloud.com',
      'Referer': 'https://www.mixcloud.com/',
    };
  }
}
