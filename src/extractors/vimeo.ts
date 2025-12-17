/**
 * Vimeo Extractor
 *
 * Extracts video information from Vimeo.
 * Supports regular videos, unlisted videos, and player embeds.
 *
 * @example
 * ```typescript
 * const extractor = new VimeoExtractor(client);
 * const info = await extractor.extract('https://vimeo.com/123456789');
 * ```
 */

import {
  BaseExtractor,
  ExtractorResult,
  ExtractorError,
  Format,
} from './base.js';

interface VimeoVideoConfig {
  video: {
    id: number;
    title: string;
    description?: string;
    duration: number;
    width: number;
    height: number;
    thumbs: Record<string, string>;
  };
  request: {
    files: {
      progressive?: Array<{
        profile: number;
        width: number;
        height: number;
        mime: string;
        fps: number;
        url: string;
        quality: string;
      }>;
      hls?: {
        cdns: Record<string, { url: string; avc_url?: string }>;
      };
      dash?: {
        cdns: Record<string, { url: string; avc_url?: string }>;
      };
    };
  };
  user?: {
    id: number;
    name: string;
    url: string;
  };
}

interface VimeoApiResponse {
  uri: string;
  name: string;
  description: string;
  duration: number;
  width: number;
  height: number;
  created_time: string;
  user: {
    uri: string;
    name: string;
  };
  pictures: {
    sizes: Array<{ link: string; width: number; height: number }>;
  };
  stats: {
    plays: number;
  };
  files?: Array<{
    quality: string;
    type: string;
    width: number;
    height: number;
    link: string;
    fps: number;
  }>;
  download?: Array<{
    quality: string;
    type: string;
    width: number;
    height: number;
    link: string;
  }>;
}

export class VimeoExtractor extends BaseExtractor {
  readonly VALID_URL = [
    // Standard video URLs
    /https?:\/\/(?:www\.)?vimeo\.com\/(?<id>\d+)/,
    // Video with hash (unlisted)
    /https?:\/\/(?:www\.)?vimeo\.com\/(?<id>\d+)\/(?<unlisted_hash>[a-f0-9]+)/,
    // Player embed
    /https?:\/\/player\.vimeo\.com\/video\/(?<player_id>\d+)/,
    // Channel/user videos
    /https?:\/\/(?:www\.)?vimeo\.com\/channels\/[^\/]+\/(?<channel_id>\d+)/,
    // Groups
    /https?:\/\/(?:www\.)?vimeo\.com\/groups\/[^\/]+\/videos\/(?<group_id>\d+)/,
    // Album/showcase
    /https?:\/\/(?:www\.)?vimeo\.com\/album\/\d+\/video\/(?<album_id>\d+)/,
    // Ondemand
    /https?:\/\/(?:www\.)?vimeo\.com\/ondemand\/[^\/]+\/(?<ondemand_id>\d+)/,
  ];
  readonly IE_NAME = 'vimeo';
  readonly AGE_LIMIT = 0;

  async extract(url: string): Promise<ExtractorResult> {
    const videoId = this.extractVideoId(url);
    const unlistedHash = this.extractUnlistedHash(url);

    if (!videoId) {
      throw new ExtractorError('Could not extract video ID from URL');
    }

    // Try multiple extraction methods
    let result = await this.extractViaPlayer(videoId, unlistedHash);

    if (!result) {
      result = await this.extractViaWebpage(videoId, unlistedHash);
    }

    if (!result) {
      throw new ExtractorError('Could not extract video data');
    }

    return result;
  }

  /**
   * Extract video ID from URL
   */
  private extractVideoId(url: string): string | null {
    for (const pattern of this.VALID_URL as RegExp[]) {
      const match = url.match(pattern);
      if (match?.groups) {
        return match.groups.id ||
               match.groups.player_id ||
               match.groups.channel_id ||
               match.groups.group_id ||
               match.groups.album_id ||
               match.groups.ondemand_id ||
               null;
      }
    }
    return null;
  }

  /**
   * Extract unlisted hash from URL
   */
  private extractUnlistedHash(url: string): string | null {
    const match = url.match(/vimeo\.com\/\d+\/([a-f0-9]+)/);
    return match?.[1] || null;
  }

  /**
   * Extract via player config
   */
  private async extractViaPlayer(
    videoId: string,
    unlistedHash: string | null
  ): Promise<ExtractorResult | null> {
    try {
      let playerUrl = `https://player.vimeo.com/video/${videoId}/config`;
      if (unlistedHash) {
        playerUrl += `?h=${unlistedHash}`;
      }

      const config = await this.client.get(playerUrl, {
        headers: this.getHeaders(),
      }).json<VimeoVideoConfig>();

      if (!config.video) {
        return null;
      }

      const formats: Format[] = [];

      // Progressive (direct MP4) formats
      if (config.request.files.progressive) {
        for (const prog of config.request.files.progressive) {
          formats.push({
            url: prog.url,
            formatId: `${prog.quality}-${prog.height}p`,
            ext: 'mp4',
            protocol: 'https',
            width: prog.width,
            height: prog.height,
            fps: prog.fps,
          });
        }
      }

      // HLS formats
      if (config.request.files.hls?.cdns) {
        for (const [cdnName, cdn] of Object.entries(config.request.files.hls.cdns)) {
          const hlsUrl = cdn.avc_url || cdn.url;
          if (hlsUrl) {
            formats.push({
              url: hlsUrl,
              formatId: `hls-${cdnName}`,
              ext: 'm3u8',
              protocol: 'm3u8',
            });
          }
        }
      }

      // DASH formats (optional)
      if (config.request.files.dash?.cdns) {
        for (const [cdnName, cdn] of Object.entries(config.request.files.dash.cdns)) {
          const dashUrl = cdn.avc_url || cdn.url;
          if (dashUrl) {
            formats.push({
              url: dashUrl,
              formatId: `dash-${cdnName}`,
              ext: 'mpd',
              protocol: 'mpd',
            });
          }
        }
      }

      // Sort by quality
      formats.sort((a, b) => (b.height || 0) - (a.height || 0));

      if (formats.length === 0) {
        return null;
      }

      // Best thumbnail
      const thumbs = config.video.thumbs;
      const thumbnail = thumbs['1280'] || thumbs['960'] || thumbs['640'] || thumbs['base'];

      return {
        id: videoId,
        title: config.video.title,
        description: config.video.description,
        uploader: config.user?.name,
        uploaderId: config.user?.id?.toString(),
        thumbnail,
        duration: config.video.duration,
        isLive: false,
        formats,
      };
    } catch {
      return null;
    }
  }

  /**
   * Extract via webpage
   */
  private async extractViaWebpage(
    videoId: string,
    unlistedHash: string | null
  ): Promise<ExtractorResult | null> {
    try {
      let url = `https://vimeo.com/${videoId}`;
      if (unlistedHash) {
        url += `/${unlistedHash}`;
      }

      const webpage = await this.downloadWebpage(url);

      // Try to find config in page
      const configMatch = webpage.match(
        /var\s+config\s*=\s*(\{.+?\});/s
      ) || webpage.match(
        /window\.vimeo\.clip_page_config\s*=\s*(\{.+?\});/s
      );

      if (configMatch) {
        try {
          const config = JSON.parse(configMatch[1]);
          if (config.video?.id || config.clip?.id) {
            // Found config, extract player URL and use that method
            const playerId = config.video?.id || config.clip?.id;
            return this.extractViaPlayer(playerId.toString(), unlistedHash);
          }
        } catch {
          // JSON parse failed
        }
      }

      // Try to extract from JSON-LD
      const jsonLdMatch = webpage.match(
        /<script type="application\/ld\+json">(\{.+?\})<\/script>/s
      );

      if (jsonLdMatch) {
        try {
          const jsonLd = JSON.parse(jsonLdMatch[1]);
          if (jsonLd['@type'] === 'VideoObject') {
            // Extract what we can from JSON-LD
            return this.extractViaPlayer(videoId, unlistedHash);
          }
        } catch {
          // JSON parse failed
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get request headers
   */
  private getHeaders(): Record<string, string> {
    return {
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.5',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://vimeo.com/',
    };
  }
}
