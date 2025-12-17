/**
 * XVideos Extractor
 *
 * Extracts video URLs from XVideos.com and related domains
 *
 * @example
 * ```typescript
 * const extractor = new XVideosExtractor(client);
 * const info = await extractor.extract('https://www.xvideos.com/video12345/title');
 * console.log(info.formats); // Multiple quality formats
 * ```
 */

import {
  BaseExtractor,
  ExtractorResult,
  ExtractorError,
  Format,
} from './base.js';

export class XVideosExtractor extends BaseExtractor {
  readonly VALID_URL =
    /https?:\/\/(?:(?:[^/]+\.)?xvideos2?\.com\/video\.?|(?:www\.)?xvideos\.es\/video\.?|(?:www|flashservice)\.xvideos\.com\/embedframe\/|static-hw\.xvideos\.com\/swf\/xv-player\.swf\?.*?\bid_video=)(?<id>[0-9a-z]+)/i;
  readonly IE_NAME = 'xvideos';
  readonly AGE_LIMIT = 18;

  async extract(url: string): Promise<ExtractorResult> {
    const match = this.matchUrl(url);
    if (!match?.groups) {
      throw new ExtractorError('Invalid XVideos URL');
    }

    const videoId = match.groups.id;

    // Normalize URL to main video page
    const videoUrl = this.normalizeUrl(url, videoId);
    const webpage = await this.downloadWebpage(videoUrl);

    // Check for errors
    this.checkForErrors(webpage);

    // Extract title
    const title = this.extractTitle(webpage);

    // Extract thumbnails
    const thumbnails = this.extractThumbnails(webpage);

    // Extract duration
    const duration = this.extractDuration(webpage);

    // Extract formats
    const formats = await this.extractFormats(webpage, videoId);

    if (formats.length === 0) {
      throw new ExtractorError('Could not find video URL');
    }

    return {
      id: videoId,
      title,
      formats,
      thumbnail: thumbnails[0]?.url,
      duration,
      ageLimit: this.AGE_LIMIT,
    };
  }

  /**
   * Normalize URL to main video page
   */
  private normalizeUrl(url: string, videoId: string): string {
    // Handle embed URLs
    if (url.includes('embedframe') || url.includes('xv-player.swf')) {
      return `https://www.xvideos.com/video${videoId}/`;
    }
    return url;
  }

  /**
   * Check for error messages in page
   */
  private checkForErrors(webpage: string): void {
    const errorMatch = webpage.match(/<h1 class="inlineError">(.+?)<\/h1>/);
    if (errorMatch) {
      throw new ExtractorError(
        `XVideos said: ${this.cleanHtml(errorMatch[1])}`,
        true
      );
    }
  }

  /**
   * Extract video title
   */
  private extractTitle(webpage: string): string {
    // Try <title> tag
    const titleMatch = webpage.match(/<title>(.+?)\s+-\s+XVID/i);
    if (titleMatch) {
      return this.cleanHtml(titleMatch[1]);
    }

    // Try setVideoTitle function
    const setTitleMatch = webpage.match(
      /setVideoTitle\s*\(\s*(['"])(.+?)\1\s*\)/
    );
    if (setTitleMatch) {
      return this.cleanHtml(setTitleMatch[2]);
    }

    // Try og:title
    const ogTitle = this.ogSearchProperty('title', webpage);
    if (ogTitle) {
      return ogTitle;
    }

    return 'Unknown Title';
  }

  /**
   * Extract thumbnails
   */
  private extractThumbnails(
    webpage: string
  ): Array<{ url: string; preference: number }> {
    const thumbnails: Array<{ url: string; preference: number }> = [];

    // Standard thumbnail
    const thumbMatch = webpage.match(
      /setThumbUrl\s*\(\s*(['"])(.+?)\1\s*\)/
    );
    if (thumbMatch) {
      thumbnails.push({ url: thumbMatch[2], preference: 0 });
    }

    // 16:9 thumbnail
    const thumb169Match = webpage.match(
      /setThumbUrl169\s*\(\s*(['"])(.+?)\1\s*\)/
    );
    if (thumb169Match) {
      thumbnails.push({ url: thumb169Match[2], preference: 1 });
    }

    return thumbnails;
  }

  /**
   * Extract video duration
   */
  private extractDuration(webpage: string): number | undefined {
    // Try og:duration
    const ogDuration = this.ogSearchProperty('duration', webpage);
    if (ogDuration) {
      const seconds = parseInt(ogDuration, 10);
      if (!isNaN(seconds)) return seconds;
    }

    // Try duration span
    const durationMatch = webpage.match(
      /<span[^>]+class=["']duration["'][^>]*>.*?(\d[^<]+)/
    );
    if (durationMatch) {
      return this.parseDuration(durationMatch[1]);
    }

    return undefined;
  }

  /**
   * Extract all video formats
   */
  private async extractFormats(
    webpage: string,
    videoId: string
  ): Promise<Format[]> {
    const formats: Format[] = [];

    // Extract FLV URL from flv_url parameter
    const flvMatch = webpage.match(/flv_url=([^&]+)/);
    if (flvMatch) {
      const flvUrl = decodeURIComponent(flvMatch[1]);
      if (flvUrl) {
        formats.push({
          url: flvUrl,
          formatId: 'flv',
          ext: 'flv',
          protocol: flvUrl.startsWith('https') ? 'https' : 'http',
        });
      }
    }

    // Extract from setVideo* functions
    const setVideoMatches = webpage.matchAll(
      /setVideo([^(]+)\(\s*(['"])(https?:\/\/.+?)\2\s*\)/g
    );

    for (const match of setVideoMatches) {
      const kind = match[1].toLowerCase();
      const formatUrl = match[3];

      if (kind === 'hls') {
        // Extract HLS formats
        try {
          const hlsFormats = await this.extractM3U8Formats(formatUrl, videoId);
          // XVideos HLS can be broken sometimes, validate formats
          const validFormats = hlsFormats.filter((f) => f.url);
          formats.push(...validFormats);
        } catch {
          // HLS extraction failed, continue with other formats
        }
      } else if (kind === 'urllow' || kind === 'urlhigh') {
        // Direct MP4 URLs
        const ext = this.getExtension(formatUrl) || 'mp4';
        const quality = kind === 'urllow' ? 'low' : 'high';

        formats.push({
          url: formatUrl,
          formatId: `${ext}-${quality}`,
          ext,
          quality: kind === 'urllow' ? -2 : 0,
          protocol: formatUrl.startsWith('https') ? 'https' : 'http',
        });
      }
    }

    // Sort by quality (high first)
    formats.sort((a, b) => (b.quality || 0) - (a.quality || 0));

    return formats;
  }

  /**
   * Get file extension from URL
   */
  private getExtension(url: string): string | undefined {
    const match = url.match(/\.([a-z0-9]+)(?:[?#]|$)/i);
    return match?.[1]?.toLowerCase();
  }
}

/**
 * XVideos Quickies Extractor
 *
 * Handles XVideos quickies/short video URLs
 */
export class XVideosQuickiesExtractor extends BaseExtractor {
  readonly VALID_URL =
    /https?:\/\/(?<domain>(?:[^/?#]+\.)?xvideos2?\.com)\/(?:profiles\/|amateur-channels\/)?[^/?#]+#quickies\/a\/(?<id>\w+)/i;
  readonly IE_NAME = 'xvideos:quickies';
  readonly AGE_LIMIT = 18;

  async extract(url: string): Promise<ExtractorResult> {
    const match = this.matchUrl(url);
    if (!match?.groups) {
      throw new ExtractorError('Invalid XVideos Quickies URL');
    }

    const { domain, id } = match.groups;

    // Quickies redirect to regular video URLs
    const isDecimal = /^\d+$/.test(id);
    const videoUrl = `https://${domain}/video${isDecimal ? '' : '.'}${id}/_`;

    // Use XVideos main extractor
    const mainExtractor = new XVideosExtractor(this.client);
    return mainExtractor.extract(videoUrl);
  }
}
