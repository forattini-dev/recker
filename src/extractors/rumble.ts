/**
 * Rumble Extractor
 *
 * Extracts video information from Rumble.
 * Alternative video platform.
 *
 * @example
 * ```typescript
 * const extractor = new RumbleExtractor(client);
 * const info = await extractor.extract('https://rumble.com/v123abc-video-title.html');
 * ```
 */

import {
  BaseExtractor,
  ExtractorResult,
  ExtractorError,
  Format,
} from './base.js';

interface RumbleVideoInfo {
  id: string;
  title: string;
  description?: string;
  channel?: {
    name: string;
    id: string;
  };
  thumbnail?: string;
  duration?: number;
  views?: number;
  pubDate?: string;
  ua?: {
    mp4?: Record<string, { url: string }>;
    webm?: Record<string, { url: string }>;
    hls?: { auto: { url: string } };
  };
  u?: {
    mp4?: Record<string, { url: string }>;
    webm?: Record<string, { url: string }>;
    hls?: { auto: { url: string } };
  };
}

export class RumbleExtractor extends BaseExtractor {
  readonly VALID_URL = [
    // Video pages
    /https?:\/\/(?:www\.)?rumble\.com\/(?<id>v[a-z0-9]+)[^\/]*\.html/,
    // Embed URLs
    /https?:\/\/(?:www\.)?rumble\.com\/embed\/(?<embed_id>[a-z0-9]+)/,
    // Channel live
    /https?:\/\/(?:www\.)?rumble\.com\/c\/(?<channel>[^\/]+)\/live/,
    // User pages
    /https?:\/\/(?:www\.)?rumble\.com\/user\/(?<user>[^\/]+)/,
  ];
  readonly IE_NAME = 'rumble';
  readonly AGE_LIMIT = 0;

  async extract(url: string): Promise<ExtractorResult> {
    // Extract video ID
    const embedMatch = url.match(/embed\/([a-z0-9]+)/);
    const videoMatch = url.match(/rumble\.com\/(v[a-z0-9]+)/);

    let videoId: string | null = null;
    let embedId: string | null = null;

    if (embedMatch) {
      embedId = embedMatch[1];
    } else if (videoMatch) {
      videoId = videoMatch[1];
      // Get embed ID from page
      embedId = await this.getEmbedId(url);
    }

    if (!embedId) {
      throw new ExtractorError('Could not extract video ID from URL');
    }

    // Get video info from embed API
    const videoInfo = await this.getVideoInfo(embedId);

    if (!videoInfo) {
      throw new ExtractorError('Could not fetch video data');
    }

    const formats = this.buildFormats(videoInfo);

    if (formats.length === 0) {
      throw new ExtractorError('No playable formats found');
    }

    return {
      id: videoId || embedId,
      title: videoInfo.title,
      description: videoInfo.description,
      uploader: videoInfo.channel?.name,
      uploaderId: videoInfo.channel?.id,
      thumbnail: videoInfo.thumbnail,
      duration: videoInfo.duration,
      viewCount: videoInfo.views,
      isLive: false,
      formats,
    };
  }

  /**
   * Get embed ID from video page
   */
  private async getEmbedId(url: string): Promise<string | null> {
    try {
      const html = await this.downloadWebpage(url);

      // Find embed URL in page
      const embedMatch = html.match(/embed\/([a-z0-9]+)/);
      if (embedMatch) {
        return embedMatch[1];
      }

      // Try data-video attribute
      const dataMatch = html.match(/data-video="([a-z0-9]+)"/);
      if (dataMatch) {
        return dataMatch[1];
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get video info from embed API
   */
  private async getVideoInfo(embedId: string): Promise<RumbleVideoInfo | null> {
    try {
      // Fetch embed page
      const params = new URLSearchParams({
        request: 'video',
        v: embedId,
      });

      const response = await this.client.get(
        `https://rumble.com/embedJS/u3/?${params}`,
        {
          headers: this.getHeaders(),
        }
      ).json<RumbleVideoInfo>();

      return response;
    } catch {
      // Try fetching from video page
      return this.extractFromWebpage(embedId);
    }
  }

  /**
   * Extract info from webpage
   */
  private async extractFromWebpage(embedId: string): Promise<RumbleVideoInfo | null> {
    try {
      const html = await this.client.get(
        `https://rumble.com/embed/${embedId}/`,
        {
          headers: this.getHeaders(),
        }
      ).text();

      // Find video data in script
      const dataMatch = html.match(/Rumble\("play",\s*(\{.+?\})\)/s);
      if (!dataMatch) return null;

      // Clean up JSON (remove trailing commas, etc.)
      let jsonStr = dataMatch[1]
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']');

      // Try to parse
      try {
        const data = JSON.parse(jsonStr);
        return {
          id: embedId,
          title: data.title,
          description: data.description,
          thumbnail: data.i,
          duration: data.duration,
          ua: data.ua,
          u: data.u,
        };
      } catch {
        // Extract URLs manually
        const mp4Match = html.match(/"mp4":\s*\{[^}]*"url":\s*"([^"]+)"/);
        const hlsMatch = html.match(/"hls":\s*\{[^}]*"url":\s*"([^"]+)"/);
        const titleMatch = html.match(/"title":\s*"([^"]+)"/);

        if (mp4Match || hlsMatch) {
          return {
            id: embedId,
            title: titleMatch?.[1] || `Rumble ${embedId}`,
            ua: {
              mp4: mp4Match ? { '360': { url: mp4Match[1] } } : undefined,
              hls: hlsMatch ? { auto: { url: hlsMatch[1] } } : undefined,
            },
          };
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Build format list
   */
  private buildFormats(videoInfo: RumbleVideoInfo): Format[] {
    const formats: Format[] = [];
    const sources = videoInfo.ua || videoInfo.u;

    if (!sources) return formats;

    // MP4 formats
    if (sources.mp4) {
      for (const [quality, data] of Object.entries(sources.mp4)) {
        if (!data.url) continue;

        const height = parseInt(quality, 10) || this.parseQuality(quality);
        formats.push({
          url: data.url,
          formatId: `mp4-${quality}`,
          ext: 'mp4',
          protocol: 'https',
          height,
        });
      }
    }

    // WebM formats
    if (sources.webm) {
      for (const [quality, data] of Object.entries(sources.webm)) {
        if (!data.url) continue;

        const height = parseInt(quality, 10) || this.parseQuality(quality);
        formats.push({
          url: data.url,
          formatId: `webm-${quality}`,
          ext: 'webm',
          protocol: 'https',
          height,
        });
      }
    }

    // HLS
    if (sources.hls?.auto?.url) {
      formats.push({
        url: sources.hls.auto.url,
        formatId: 'hls',
        ext: 'm3u8',
        protocol: 'm3u8',
      });
    }

    // Sort by quality
    formats.sort((a, b) => (b.height || 0) - (a.height || 0));

    return formats;
  }

  /**
   * Parse quality string to height
   */
  private parseQuality(quality: string): number | undefined {
    const match = quality.match(/(\d+)p?/i);
    if (match) return parseInt(match[1], 10);

    const map: Record<string, number> = {
      'sd': 480,
      'hd': 720,
      'fhd': 1080,
      '4k': 2160,
    };

    return map[quality.toLowerCase()];
  }

  /**
   * Get request headers
   */
  private getHeaders(): Record<string, string> {
    return {
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'Accept-Language': 'en-US,en;q=0.5',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://rumble.com/',
    };
  }
}
