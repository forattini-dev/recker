/**
 * Coub Extractor
 *
 * Extracts video information from Coub.
 * Short looping video platform.
 *
 * @example
 * ```typescript
 * const extractor = new CoubExtractor(client);
 * const info = await extractor.extract('https://coub.com/view/abcdef');
 * ```
 */

import {
  BaseExtractor,
  ExtractorResult,
  ExtractorError,
  Format,
} from './base.js';

interface CoubVideo {
  id: number;
  permalink: string;
  title: string;
  visibility_type: string;
  channel: {
    id: number;
    permalink: string;
    title: string;
  };
  created_at: string;
  views_count: number;
  likes_count: number;
  recoubs_count: number;
  duration: number;
  file_versions: {
    html5: {
      video?: {
        high?: { url: string; size: number };
        med?: { url: string; size: number };
      };
      audio?: {
        high?: { url: string; size: number };
        med?: { url: string; size: number };
        sample_duration: number;
      };
    };
    share?: {
      default: string;
    };
    mobile?: {
      video: string;
      audio: string;
    };
  };
  picture: string;
  first_frame_versions?: {
    big?: string;
    med?: string;
  };
  audio_versions?: {
    template: string;
    versions: string[];
  };
}

export class CoubExtractor extends BaseExtractor {
  readonly VALID_URL = [
    // Standard view URLs
    /https?:\/\/(?:www\.)?coub\.com\/view\/(?<id>[a-zA-Z0-9]+)/,
    // Embed URLs
    /https?:\/\/(?:www\.)?coub\.com\/embed\/(?<embed_id>[a-zA-Z0-9]+)/,
  ];
  readonly IE_NAME = 'coub';
  readonly AGE_LIMIT = 0;

  async extract(url: string): Promise<ExtractorResult> {
    const coubId = this.extractCoubId(url);

    if (!coubId) {
      throw new ExtractorError('Could not extract coub ID from URL');
    }

    // Fetch coub data
    const coub = await this.getCoubData(coubId);

    if (!coub) {
      throw new ExtractorError('Could not fetch coub data');
    }

    const formats = this.buildFormats(coub);

    if (formats.length === 0) {
      throw new ExtractorError('No playable formats found');
    }

    return {
      id: coubId,
      title: coub.title || `Coub ${coubId}`,
      uploader: coub.channel?.title,
      uploaderId: coub.channel?.permalink,
      thumbnail: coub.first_frame_versions?.big || coub.picture,
      duration: coub.duration,
      viewCount: coub.views_count,
      likeCount: coub.likes_count,
      isLive: false,
      formats,
    };
  }

  /**
   * Extract coub ID from URL
   */
  private extractCoubId(url: string): string | null {
    const match = url.match(/coub\.com\/(?:view|embed)\/([a-zA-Z0-9]+)/);
    return match?.[1] || null;
  }

  /**
   * Get coub data from API
   */
  private async getCoubData(coubId: string): Promise<CoubVideo | null> {
    try {
      const response = await this.client.get(
        `https://coub.com/api/v2/coubs/${coubId}`,
        {
          headers: this.getHeaders(),
        }
      ).json<CoubVideo>();

      return response;
    } catch {
      return null;
    }
  }

  /**
   * Build format list
   */
  private buildFormats(coub: CoubVideo): Format[] {
    const formats: Format[] = [];
    const html5 = coub.file_versions?.html5;

    // Share version (usually best for downloading)
    if (coub.file_versions?.share?.default) {
      formats.push({
        url: coub.file_versions.share.default,
        formatId: 'share',
        ext: 'mp4',
        protocol: 'https',
      });
    }

    // High quality video
    if (html5?.video?.high?.url) {
      formats.push({
        url: html5.video.high.url,
        formatId: 'video-high',
        ext: 'mp4',
        protocol: 'https',
        vcodec: 'h264',
        acodec: 'none', // Video only, need to merge with audio
      });
    }

    // Medium quality video
    if (html5?.video?.med?.url) {
      formats.push({
        url: html5.video.med.url,
        formatId: 'video-med',
        ext: 'mp4',
        protocol: 'https',
        vcodec: 'h264',
        acodec: 'none',
      });
    }

    // Mobile version (video + audio combined)
    if (coub.file_versions?.mobile?.video) {
      formats.push({
        url: coub.file_versions.mobile.video,
        formatId: 'mobile',
        ext: 'mp4',
        protocol: 'https',
      });
    }

    // Audio tracks (separate)
    if (html5?.audio?.high?.url) {
      formats.push({
        url: html5.audio.high.url,
        formatId: 'audio-high',
        ext: 'mp3',
        protocol: 'https',
        vcodec: 'none',
        acodec: 'mp3',
      });
    }

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
    };
  }
}
