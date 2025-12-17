/**
 * Dailymotion Extractor
 *
 * Extracts video information from Dailymotion.
 * Supports regular videos and embeds.
 *
 * @example
 * ```typescript
 * const extractor = new DailymotionExtractor(client);
 * const info = await extractor.extract('https://dailymotion.com/video/x123456');
 * ```
 */

import {
  BaseExtractor,
  ExtractorResult,
  ExtractorError,
  Format,
} from './base.js';

interface DailymotionVideoData {
  id: string;
  title: string;
  description: string;
  owner: {
    username: string;
    screenname: string;
    id: string;
  };
  duration: number;
  created_time: number;
  thumbnail_url: string;
  views_total: number;
  likes_total: number;
  postedTime?: number;
}

interface DailymotionMetadata {
  qualities: Record<string, Array<{
    type: string;
    url: string;
  }>>;
  subtitles?: {
    data: Record<string, { urls: string[] }>;
  };
}

export class DailymotionExtractor extends BaseExtractor {
  readonly VALID_URL = [
    // Standard video URLs
    /https?:\/\/(?:www\.)?dailymotion\.com\/video\/(?<id>[a-zA-Z0-9]+)/,
    // Short URLs
    /https?:\/\/dai\.ly\/(?<short_id>[a-zA-Z0-9]+)/,
    // Embed URLs
    /https?:\/\/(?:www\.)?dailymotion\.com\/embed\/video\/(?<embed_id>[a-zA-Z0-9]+)/,
    // Player URLs
    /https?:\/\/(?:www\.)?dailymotion\.com\/player\/(?<player_id>[a-zA-Z0-9]+)/,
  ];
  readonly IE_NAME = 'dailymotion';
  readonly AGE_LIMIT = 0;

  async extract(url: string): Promise<ExtractorResult> {
    const videoId = this.extractVideoId(url);

    if (!videoId) {
      throw new ExtractorError('Could not extract video ID from URL');
    }

    // Get video metadata
    const videoData = await this.getVideoData(videoId);

    if (!videoData) {
      throw new ExtractorError('Could not fetch video data');
    }

    // Get streaming URLs
    const metadata = await this.getMetadata(videoId);

    if (!metadata) {
      throw new ExtractorError('Could not get video streams');
    }

    const formats = this.extractFormats(metadata);

    if (formats.length === 0) {
      throw new ExtractorError('No playable formats found');
    }

    return {
      id: videoId,
      title: videoData.title,
      description: videoData.description,
      uploader: videoData.owner.screenname,
      uploaderId: videoData.owner.username,
      thumbnail: videoData.thumbnail_url,
      duration: videoData.duration,
      viewCount: videoData.views_total,
      likeCount: videoData.likes_total,
      timestamp: videoData.created_time,
      isLive: false,
      formats,
    };
  }

  /**
   * Extract video ID from URL
   */
  private extractVideoId(url: string): string | null {
    for (const pattern of this.VALID_URL as RegExp[]) {
      const match = url.match(pattern);
      if (match?.groups) {
        return match.groups.id ||
               match.groups.short_id ||
               match.groups.embed_id ||
               match.groups.player_id ||
               null;
      }
    }
    return null;
  }

  /**
   * Get video data via API
   */
  private async getVideoData(videoId: string): Promise<DailymotionVideoData | null> {
    try {
      const fields = [
        'id', 'title', 'description', 'owner.username', 'owner.screenname', 'owner.id',
        'duration', 'created_time', 'thumbnail_url', 'views_total', 'likes_total'
      ].join(',');

      const params = new URLSearchParams({ fields });
      const response = await this.client.get(
        `https://api.dailymotion.com/video/${videoId}?${params}`,
        {
          headers: this.getHeaders(),
        }
      ).json<DailymotionVideoData>();

      return response;
    } catch {
      return null;
    }
  }

  /**
   * Get video metadata with streaming URLs
   */
  private async getMetadata(videoId: string): Promise<DailymotionMetadata | null> {
    try {
      const response = await this.client.get(
        `https://www.dailymotion.com/player/metadata/video/${videoId}`,
        {
          headers: this.getHeaders(),
        }
      ).json<DailymotionMetadata>();

      return response;
    } catch {
      return null;
    }
  }

  /**
   * Extract formats from metadata
   */
  private extractFormats(metadata: DailymotionMetadata): Format[] {
    const formats: Format[] = [];

    if (!metadata.qualities) {
      return formats;
    }

    for (const [quality, streams] of Object.entries(metadata.qualities)) {
      for (const stream of streams) {
        const height = this.parseQuality(quality);

        if (stream.type === 'application/x-mpegURL') {
          // HLS
          formats.push({
            url: stream.url,
            formatId: `hls-${quality}`,
            ext: 'm3u8',
            protocol: 'm3u8',
            height,
          });
        } else if (stream.type === 'video/mp4') {
          // MP4
          formats.push({
            url: stream.url,
            formatId: `mp4-${quality}`,
            ext: 'mp4',
            protocol: 'https',
            height,
          });
        }
      }
    }

    // Sort by quality
    formats.sort((a, b) => (b.height || 0) - (a.height || 0));

    return formats;
  }

  /**
   * Parse quality label to height
   */
  private parseQuality(quality: string): number | undefined {
    const match = quality.match(/(\d+)/);
    if (match) {
      return parseInt(match[1], 10);
    }

    const qualityMap: Record<string, number> = {
      'auto': 0,
      'ld': 240,
      'sd': 480,
      'hq': 720,
      'hd': 1080,
      'fhd': 1080,
      'qhd': 1440,
      'uhd': 2160,
    };

    return qualityMap[quality.toLowerCase()];
  }

  /**
   * Get request headers
   */
  private getHeaders(): Record<string, string> {
    return {
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.5',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };
  }
}
