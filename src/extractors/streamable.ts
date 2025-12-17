/**
 * Streamable Extractor
 *
 * Extracts video information from Streamable.
 * Simple video hosting platform.
 *
 * @example
 * ```typescript
 * const extractor = new StreamableExtractor(client);
 * const info = await extractor.extract('https://streamable.com/abcdef');
 * ```
 */

import {
  BaseExtractor,
  ExtractorResult,
  ExtractorError,
  Format,
} from './base.js';

interface StreamableVideo {
  status: number;
  percent: number;
  url: string;
  embed_code: string;
  message: string | null;
  files: {
    mp4?: {
      url: string;
      width: number;
      height: number;
      bitrate: number;
      size: number;
      framerate: number;
    };
    'mp4-mobile'?: {
      url: string;
      width: number;
      height: number;
      bitrate: number;
      size: number;
      framerate: number;
    };
  };
  thumbnail_url: string;
  title: string;
  original_name?: string;
}

export class StreamableExtractor extends BaseExtractor {
  readonly VALID_URL = [
    /https?:\/\/(?:www\.)?streamable\.com\/(?:e\/)?(?<id>[a-zA-Z0-9]+)/,
  ];
  readonly IE_NAME = 'streamable';
  readonly AGE_LIMIT = 0;

  async extract(url: string): Promise<ExtractorResult> {
    const videoId = this.extractVideoId(url);

    if (!videoId) {
      throw new ExtractorError('Could not extract video ID from URL');
    }

    // Fetch video info from API
    const videoData = await this.getVideoInfo(videoId);

    if (!videoData) {
      throw new ExtractorError('Could not fetch video data');
    }

    if (videoData.status !== 2) {
      throw new ExtractorError('Video is not ready or unavailable');
    }

    const formats = this.buildFormats(videoData);

    if (formats.length === 0) {
      throw new ExtractorError('No playable formats found');
    }

    return {
      id: videoId,
      title: videoData.title || videoData.original_name || `Streamable ${videoId}`,
      thumbnail: videoData.thumbnail_url ? `https:${videoData.thumbnail_url}` : undefined,
      isLive: false,
      formats,
    };
  }

  /**
   * Extract video ID from URL
   */
  private extractVideoId(url: string): string | null {
    const match = url.match(/streamable\.com\/(?:e\/)?([a-zA-Z0-9]+)/);
    return match?.[1] || null;
  }

  /**
   * Get video info from API
   */
  private async getVideoInfo(videoId: string): Promise<StreamableVideo | null> {
    try {
      const response = await this.client.get(
        `https://api.streamable.com/videos/${videoId}`,
        {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        }
      ).json<StreamableVideo>();

      return response;
    } catch {
      return null;
    }
  }

  /**
   * Build format list
   */
  private buildFormats(videoData: StreamableVideo): Format[] {
    const formats: Format[] = [];

    // Main MP4
    if (videoData.files.mp4) {
      const mp4 = videoData.files.mp4;
      formats.push({
        url: mp4.url.startsWith('//') ? `https:${mp4.url}` : mp4.url,
        formatId: 'mp4',
        ext: 'mp4',
        protocol: 'https',
        width: mp4.width,
        height: mp4.height,
        bandwidth: mp4.bitrate,
      });
    }

    // Mobile MP4 (lower quality)
    if (videoData.files['mp4-mobile']) {
      const mobile = videoData.files['mp4-mobile'];
      formats.push({
        url: mobile.url.startsWith('//') ? `https:${mobile.url}` : mobile.url,
        formatId: 'mp4-mobile',
        ext: 'mp4',
        protocol: 'https',
        width: mobile.width,
        height: mobile.height,
        bandwidth: mobile.bitrate,
      });
    }

    // Sort by quality
    formats.sort((a, b) => (b.height || 0) - (a.height || 0));

    return formats;
  }
}
