/**
 * Facebook Extractor
 *
 * Extracts video information from Facebook.
 * Supports videos, Reels, Watch, and live streams.
 *
 * @example
 * ```typescript
 * const extractor = new FacebookExtractor(client);
 * const info = await extractor.extract('https://www.facebook.com/watch/?v=123456789');
 * ```
 */

import {
  BaseExtractor,
  ExtractorResult,
  ExtractorError,
  Format,
} from './base.js';

interface FacebookVideoData {
  id: string;
  title?: string;
  description?: string;
  owner?: {
    name: string;
    id: string;
  };
  playable_url?: string;
  playable_url_quality_hd?: string;
  playable_url_dash?: string;
  browser_native_hd_url?: string;
  browser_native_sd_url?: string;
  thumbnail?: string;
  length_in_second?: number;
  view_count?: number;
  is_live_streaming?: boolean;
  dash_manifest?: string;
}

export class FacebookExtractor extends BaseExtractor {
  readonly VALID_URL = [
    // Standard video URLs
    /https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/(?:video\.php\?v=|watch\/?\?v=|.*?\/videos\/)(?<id>\d+)/,
    // Reel URLs
    /https?:\/\/(?:www\.|m\.)?facebook\.com\/reel\/(?<reel_id>\d+)/,
    // Story URLs
    /https?:\/\/(?:www\.|m\.)?facebook\.com\/stories\/(?<story_id>\d+)/,
    // User/Page video URLs
    /https?:\/\/(?:www\.|m\.)?facebook\.com\/(?<user>[^\/]+)\/videos\/(?<video_id>\d+)/,
    // fb.watch short URLs
    /https?:\/\/fb\.watch\/(?<short_id>[a-zA-Z0-9_-]+)/,
    // fb.gg gaming
    /https?:\/\/fb\.gg\/v\/(?<gg_id>\d+)/,
  ];
  readonly IE_NAME = 'facebook';
  readonly AGE_LIMIT = 0;

  async extract(url: string): Promise<ExtractorResult> {
    // Resolve short URLs first
    if (url.includes('fb.watch') || url.includes('fb.gg')) {
      url = await this.resolveShortUrl(url);
    }

    // Extract video ID
    const videoId = this.extractVideoId(url);
    if (!videoId) {
      throw new ExtractorError('Could not extract video ID from URL');
    }

    // Try multiple extraction methods
    let videoData = await this.extractFromGraphQL(videoId);

    if (!videoData) {
      videoData = await this.extractFromWebpage(url);
    }

    if (!videoData) {
      throw new ExtractorError('Could not extract video data');
    }

    const formats = this.buildFormats(videoData);

    if (formats.length === 0) {
      throw new ExtractorError('No playable formats found');
    }

    return {
      id: videoId,
      title: videoData.title || `Facebook Video ${videoId}`,
      description: videoData.description,
      uploader: videoData.owner?.name,
      uploaderId: videoData.owner?.id,
      thumbnail: videoData.thumbnail,
      duration: videoData.length_in_second,
      viewCount: videoData.view_count,
      isLive: videoData.is_live_streaming || false,
      formats,
    };
  }

  /**
   * Resolve short URLs
   */
  private async resolveShortUrl(url: string): Promise<string> {
    try {
      const html = await this.client.get(url, {
        headers: this.getHeaders(),
      }).text();

      // Look for canonical URL
      const canonical = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/);
      if (canonical) {
        return canonical[1].replace(/&amp;/g, '&');
      }

      // Look for og:url
      const ogUrl = html.match(/<meta[^>]+property="og:url"[^>]+content="([^"]+)"/);
      if (ogUrl) {
        return ogUrl[1].replace(/&amp;/g, '&');
      }

      return url;
    } catch {
      return url;
    }
  }

  /**
   * Extract video ID from URL
   */
  private extractVideoId(url: string): string | null {
    // Try each pattern
    for (const pattern of this.VALID_URL as RegExp[]) {
      const match = url.match(pattern);
      if (match?.groups) {
        return match.groups.id ||
               match.groups.reel_id ||
               match.groups.video_id ||
               match.groups.short_id ||
               match.groups.gg_id ||
               null;
      }
    }

    // Fallback: extract any numeric ID
    const numericMatch = url.match(/(?:v=|videos\/|reel\/)(\d+)/);
    return numericMatch?.[1] || null;
  }

  /**
   * Extract via GraphQL API
   */
  private async extractFromGraphQL(videoId: string): Promise<FacebookVideoData | null> {
    try {
      const variables = {
        videoID: videoId,
      };

      const params = new URLSearchParams({
        doc_id: '5279476072161634', // Video query doc ID
        variables: JSON.stringify(variables),
      });

      const response = await this.client.post(
        'https://www.facebook.com/api/graphql/',
        params.toString(),
        {
          headers: {
            ...this.getHeaders(),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      ).json<any>();

      const video = response?.data?.video;
      if (!video) return null;

      return {
        id: videoId,
        title: video.title?.text || video.savable_description?.text,
        description: video.savable_description?.text,
        owner: video.owner ? {
          name: video.owner.name,
          id: video.owner.id,
        } : undefined,
        playable_url: video.playable_url,
        playable_url_quality_hd: video.playable_url_quality_hd,
        browser_native_hd_url: video.browser_native_hd_url,
        browser_native_sd_url: video.browser_native_sd_url,
        thumbnail: video.preferred_thumbnail?.image?.uri,
        length_in_second: video.playable_duration_in_ms ? Math.floor(video.playable_duration_in_ms / 1000) : undefined,
        view_count: video.video_view_count,
        is_live_streaming: video.is_live_streaming,
        dash_manifest: video.dash_manifest,
      };
    } catch {
      return null;
    }
  }

  /**
   * Extract from webpage HTML
   */
  private async extractFromWebpage(url: string): Promise<FacebookVideoData | null> {
    try {
      const webpage = await this.downloadWebpage(url);

      // Try to find video data in various formats
      const videoData = this.extractFromHtml(webpage);

      return videoData;
    } catch {
      return null;
    }
  }

  /**
   * Extract video data from HTML
   */
  private extractFromHtml(html: string): FacebookVideoData | null {
    // Look for JSON data in script tags
    const patterns = [
      // New format
      /"playable_url":\s*"([^"]+)"/,
      /"playable_url_quality_hd":\s*"([^"]+)"/,
      /"browser_native_hd_url":\s*"([^"]+)"/,
      /"browser_native_sd_url":\s*"([^"]+)"/,
      // Video data object
      /"video":\s*\{[^}]*"id":\s*"(\d+)"/,
    ];

    let playableUrl: string | undefined;
    let hdUrl: string | undefined;
    let sdUrl: string | undefined;
    let videoId: string | undefined;

    // Extract playable URLs
    const playableMatch = html.match(/"playable_url":\s*"([^"]+)"/);
    if (playableMatch) {
      playableUrl = this.decodeEscapedUrl(playableMatch[1]);
    }

    const hdMatch = html.match(/"(?:playable_url_quality_hd|browser_native_hd_url)":\s*"([^"]+)"/);
    if (hdMatch) {
      hdUrl = this.decodeEscapedUrl(hdMatch[1]);
    }

    const sdMatch = html.match(/"browser_native_sd_url":\s*"([^"]+)"/);
    if (sdMatch) {
      sdUrl = this.decodeEscapedUrl(sdMatch[1]);
    }

    // Extract video ID
    const idMatch = html.match(/"video_id":\s*"?(\d+)"?/) ||
                    html.match(/content="fb:\/\/video\/(\d+)"/) ||
                    html.match(/video\.php\?v=(\d+)/);
    if (idMatch) {
      videoId = idMatch[1];
    }

    // Extract title
    const titleMatch = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/) ||
                       html.match(/"title":\s*\{"text":\s*"([^"]+)"\}/);
    const title = titleMatch ? this.decodeHtmlEntities(titleMatch[1]) : undefined;

    // Extract description
    const descMatch = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/);
    const description = descMatch ? this.decodeHtmlEntities(descMatch[1]) : undefined;

    // Extract thumbnail
    const thumbMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/);
    const thumbnail = thumbMatch ? thumbMatch[1].replace(/&amp;/g, '&') : undefined;

    // Extract duration
    const durationMatch = html.match(/"playable_duration_in_ms":\s*(\d+)/);
    const duration = durationMatch ? Math.floor(parseInt(durationMatch[1], 10) / 1000) : undefined;

    if (!playableUrl && !hdUrl && !sdUrl) {
      return null;
    }

    return {
      id: videoId || 'unknown',
      title,
      description,
      playable_url: playableUrl || sdUrl,
      playable_url_quality_hd: hdUrl,
      browser_native_hd_url: hdUrl,
      browser_native_sd_url: sdUrl,
      thumbnail,
      length_in_second: duration,
    };
  }

  /**
   * Build format list
   */
  private buildFormats(videoData: FacebookVideoData): Format[] {
    const formats: Format[] = [];

    // HD version
    if (videoData.playable_url_quality_hd || videoData.browser_native_hd_url) {
      formats.push({
        url: videoData.playable_url_quality_hd || videoData.browser_native_hd_url!,
        formatId: 'hd',
        ext: 'mp4',
        protocol: 'https',
        height: 720,
      });
    }

    // SD version
    if (videoData.playable_url || videoData.browser_native_sd_url) {
      formats.push({
        url: videoData.playable_url || videoData.browser_native_sd_url!,
        formatId: 'sd',
        ext: 'mp4',
        protocol: 'https',
        height: 360,
      });
    }

    // DASH manifest
    if (videoData.dash_manifest) {
      formats.push({
        url: videoData.dash_manifest,
        formatId: 'dash',
        ext: 'mpd',
        protocol: 'mpd',
      });
    }

    // Sort by quality
    formats.sort((a, b) => (b.height || 0) - (a.height || 0));

    return formats;
  }

  /**
   * Decode escaped URL
   */
  private decodeEscapedUrl(url: string): string {
    return url
      .replace(/\\u0025/g, '%')
      .replace(/\\u003d/g, '=')
      .replace(/\\u0026/g, '&')
      .replace(/\\\//g, '/')
      .replace(/\\"/g, '"');
  }

  /**
   * Decode HTML entities
   */
  private decodeHtmlEntities(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, '/');
  }

  /**
   * Get request headers
   */
  private getHeaders(): Record<string, string> {
    return {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };
  }
}
