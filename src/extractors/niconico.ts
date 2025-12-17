/**
 * NicoNico Extractor
 *
 * Extracts video information from NicoNico (Niconico Douga).
 * Japanese video sharing platform.
 *
 * @example
 * ```typescript
 * const extractor = new NicoNicoExtractor(client);
 * const info = await extractor.extract('https://www.nicovideo.jp/watch/sm12345');
 * ```
 */

import {
  BaseExtractor,
  ExtractorResult,
  ExtractorError,
  Format,
} from './base.js';

interface NicoNicoVideoData {
  video: {
    id: string;
    title: string;
    description: string;
    count: {
      view: number;
      comment: number;
      mylist: number;
      like: number;
    };
    duration: number;
    thumbnail: {
      url: string;
      ogp?: string;
    };
    registeredAt: string;
  };
  owner?: {
    id: number;
    nickname: string;
  };
  channel?: {
    id: string;
    name: string;
  };
  media: {
    domand?: {
      videos: Array<{
        id: string;
        isAvailable: boolean;
        label: string;
        bitRate: number;
        width: number;
        height: number;
      }>;
      audios: Array<{
        id: string;
        isAvailable: boolean;
        bitRate: number;
        samplingRate: number;
      }>;
    };
    delivery?: {
      movie: {
        session: {
          urls: Array<{
            url: string;
            isWellKnownPort: boolean;
            isSsl: boolean;
          }>;
        };
      };
    };
  };
}

interface NicoNicoSession {
  data: {
    session: {
      content_uri: string;
      id: string;
    };
  };
}

export class NicoNicoExtractor extends BaseExtractor {
  readonly VALID_URL = [
    // Standard watch URLs
    /https?:\/\/(?:www\.)?nicovideo\.jp\/watch\/(?<id>[a-z]{2}\d+)/,
    // Short URLs
    /https?:\/\/nico\.ms\/(?<short_id>[a-z]{2}\d+)/,
    // SP (mobile) URLs
    /https?:\/\/sp\.nicovideo\.jp\/watch\/(?<sp_id>[a-z]{2}\d+)/,
  ];
  readonly IE_NAME = 'niconico';
  readonly AGE_LIMIT = 0;

  async extract(url: string): Promise<ExtractorResult> {
    // Handle short URLs
    if (url.includes('nico.ms')) {
      const match = url.match(/nico\.ms\/([a-z]{2}\d+)/);
      if (match) {
        url = `https://www.nicovideo.jp/watch/${match[1]}`;
      }
    }

    const videoId = this.extractVideoId(url);

    if (!videoId) {
      throw new ExtractorError('Could not extract video ID from URL');
    }

    // Get video info from webpage
    const videoData = await this.getVideoData(videoId);

    if (!videoData) {
      throw new ExtractorError('Could not fetch video data');
    }

    const formats = await this.buildFormats(videoData, videoId);

    if (formats.length === 0) {
      throw new ExtractorError('No playable formats found');
    }

    const uploader = videoData.owner?.nickname || videoData.channel?.name;
    const uploaderId = videoData.owner?.id?.toString() || videoData.channel?.id;

    return {
      id: videoId,
      title: videoData.video.title,
      description: videoData.video.description,
      uploader,
      uploaderId,
      thumbnail: videoData.video.thumbnail.ogp || videoData.video.thumbnail.url,
      duration: videoData.video.duration,
      viewCount: videoData.video.count.view,
      likeCount: videoData.video.count.like,
      commentCount: videoData.video.count.comment,
      isLive: false,
      formats,
    };
  }

  /**
   * Extract video ID from URL
   */
  private extractVideoId(url: string): string | null {
    const match = url.match(/\/watch\/([a-z]{2}\d+)/) ||
                  url.match(/nico\.ms\/([a-z]{2}\d+)/);
    return match?.[1] || null;
  }

  /**
   * Get video data from webpage
   */
  private async getVideoData(videoId: string): Promise<NicoNicoVideoData | null> {
    try {
      const html = await this.downloadWebpage(
        `https://www.nicovideo.jp/watch/${videoId}`
      );

      // Extract JSON data from page
      const dataMatch = html.match(/data-api-data="([^"]+)"/) ||
                        html.match(/js-initial-watch-data"[^>]*data-api-data="([^"]+)"/);

      if (dataMatch) {
        const decoded = dataMatch[1]
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>');

        return JSON.parse(decoded);
      }

      // Try alternative format
      const jsonMatch = html.match(/<script[^>]+id="js-initial-watch-data"[^>]*>([^<]+)<\/script>/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Build format list
   */
  private async buildFormats(videoData: NicoNicoVideoData, videoId: string): Promise<Format[]> {
    const formats: Format[] = [];

    // DMC (new system) formats
    if (videoData.media.domand) {
      const domand = videoData.media.domand;

      // Video formats
      for (const video of domand.videos || []) {
        if (!video.isAvailable) continue;

        formats.push({
          url: `https://nvapi.nicovideo.jp/v1/watch/${videoId}/access-rights/hls?actionTrackId=`,
          formatId: `dmc-${video.id}`,
          ext: 'mp4',
          protocol: 'niconico_dmc',
          width: video.width,
          height: video.height,
          bandwidth: video.bitRate * 1000,
          vcodec: video.id,
          formatNote: video.label,
        });
      }
    }

    // Legacy delivery formats
    if (videoData.media.delivery?.movie) {
      const delivery = videoData.media.delivery.movie;

      for (const urlInfo of delivery.session?.urls || []) {
        if (urlInfo.isSsl) {
          formats.push({
            url: urlInfo.url,
            formatId: 'legacy-hls',
            ext: 'm3u8',
            protocol: 'm3u8',
          });
        }
      }
    }

    // If no formats found, try to get HLS URL directly
    if (formats.length === 0) {
      const hlsUrl = await this.getHlsUrl(videoId);
      if (hlsUrl) {
        formats.push({
          url: hlsUrl,
          formatId: 'hls',
          ext: 'm3u8',
          protocol: 'm3u8',
        });
      }
    }

    return formats;
  }

  /**
   * Get HLS URL via session API
   */
  private async getHlsUrl(videoId: string): Promise<string | null> {
    try {
      // Try to get guest session
      const response = await this.client.post(
        `https://www.nicovideo.jp/api/watch/v3_guest/${videoId}?_frontendId=6&_frontendVersion=0`,
        {},
        {
          headers: this.getHeaders(),
        }
      ).json<{ data?: { media?: { delivery?: { movie?: { session?: any } } } } }>();

      const session = response.data?.media?.delivery?.movie?.session;
      if (session?.urls?.[0]?.url) {
        return session.urls[0].url;
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
      'Accept-Language': 'ja-JP,ja;q=0.9,en;q=0.8',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'X-Frontend-Id': '6',
      'X-Frontend-Version': '0',
    };
  }
}
