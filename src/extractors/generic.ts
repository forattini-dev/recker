/**
 * Generic Extractor
 *
 * Attempts to extract video URLs from any webpage by detecting
 * common video formats (HLS, MP4, WebM, etc.)
 *
 * This is a fallback extractor used when no specific extractor matches.
 *
 * @example
 * ```typescript
 * const extractor = new GenericExtractor(client);
 * const info = await extractor.extract('https://example.com/video-page');
 * console.log(info.formats);
 * ```
 */

import {
  BaseExtractor,
  ExtractorResult,
  ExtractorError,
  Format,
} from './base.js';

// Common video file extensions
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mkv', 'flv', 'avi', 'mov', 'm4v', 'ogv', 'ts'];

// HLS/DASH extensions
const MANIFEST_EXTENSIONS = ['m3u8', 'mpd'];

// Patterns to extract video URLs from HTML/JavaScript
const VIDEO_URL_PATTERNS = [
  // Direct video src
  /<video[^>]+src=["']([^"']+\.(?:mp4|webm|m3u8)[^"']*)/gi,
  // Source tags
  /<source[^>]+src=["']([^"']+\.(?:mp4|webm|m3u8)[^"']*)/gi,
  // JSON properties
  /"(?:video_?url|source|file|src|url|stream)"\s*:\s*"([^"]+\.(?:mp4|webm|m3u8)[^"]*)"/gi,
  // Generic URL in quotes
  /["']([^"']+\.(?:mp4|webm|m3u8)[^"']*?)["']/gi,
  // HLS playlists
  /["']([^"']*\.m3u8[^"']*?)["']/gi,
  // DASH manifests
  /["']([^"']*\.mpd[^"']*?)["']/gi,
];

// URLs to skip (thumbnails, previews, etc.)
const SKIP_PATTERNS = [
  /preview/i,
  /thumb/i,
  /poster/i,
  /snapshot/i,
  /sprite/i,
  /\.jpg/i,
  /\.png/i,
  /\.gif/i,
  /\.webp/i,
];

export class GenericExtractor extends BaseExtractor {
  // Match any URL - this extractor is used as fallback
  readonly VALID_URL = /.*/;
  readonly IE_NAME = 'generic';
  readonly AGE_LIMIT = 0;

  async extract(url: string): Promise<ExtractorResult> {
    const webpage = await this.downloadWebpage(url);

    // Extract video ID from URL
    const videoId = this.generateId(url);

    // Extract title
    const title = this.extractTitle(webpage, url);

    // Extract thumbnail
    const thumbnail = this.extractThumbnail(webpage);

    // Extract duration
    const duration = this.extractDuration(webpage);

    // Find all video URLs
    const videoUrls = this.findVideoUrls(webpage, url);

    if (videoUrls.length === 0) {
      throw new ExtractorError('Could not find any video URL on this page');
    }

    // Extract formats from URLs
    const formats = await this.extractFormats(videoUrls, videoId);

    if (formats.length === 0) {
      throw new ExtractorError('Could not extract any playable formats');
    }

    return {
      id: videoId,
      title,
      formats,
      thumbnail,
      duration,
      ageLimit: this.AGE_LIMIT,
    };
  }

  /**
   * Generate a video ID from URL
   */
  private generateId(url: string): string {
    const urlObj = new URL(url);
    const path = urlObj.pathname;

    // Try to extract ID from path
    const pathParts = path.split('/').filter(Boolean);
    if (pathParts.length > 0) {
      // Use last path segment as ID
      return pathParts[pathParts.length - 1].replace(/\.[^.]+$/, '');
    }

    // Fallback: hash the URL
    return this.hashString(url);
  }

  /**
   * Simple hash function for ID generation
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Extract page title
   */
  private extractTitle(webpage: string, url: string): string {
    // Try og:title
    const ogTitle = this.ogSearchProperty('title', webpage);
    if (ogTitle) return ogTitle;

    // Try <title>
    const titleMatch = webpage.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      return this.cleanHtml(titleMatch[1]).trim();
    }

    // Try h1
    const h1Match = webpage.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (h1Match) {
      return this.cleanHtml(h1Match[1]).trim();
    }

    // Fallback to URL path
    return new URL(url).pathname.split('/').pop() || 'Unknown';
  }

  /**
   * Extract thumbnail
   */
  private extractThumbnail(webpage: string): string | undefined {
    // Try og:image
    const ogImage = this.ogSearchProperty('image', webpage);
    if (ogImage) return ogImage;

    // Try video poster
    const posterMatch = webpage.match(/<video[^>]+poster=["']([^"']+)["']/i);
    if (posterMatch) return posterMatch[1];

    // Try twitter:image
    const twitterImage = this.htmlSearchMeta('twitter:image', webpage);
    if (twitterImage) return twitterImage;

    return undefined;
  }

  /**
   * Extract duration
   */
  private extractDuration(webpage: string): number | undefined {
    // Try og:video:duration
    const ogDuration = this.ogSearchProperty('video:duration', webpage);
    if (ogDuration) {
      const seconds = parseInt(ogDuration, 10);
      if (!isNaN(seconds)) return seconds;
    }

    // Try duration in itemprop
    const itemDuration = webpage.match(
      /itemprop=["']duration["'][^>]+content=["']([^"']+)["']/i
    );
    if (itemDuration) {
      return this.parseDuration(itemDuration[1]);
    }

    // Try common duration patterns
    const durationMatch = webpage.match(
      /["']duration["']\s*:\s*["']?(\d+)["']?/i
    );
    if (durationMatch) {
      return parseInt(durationMatch[1], 10);
    }

    return undefined;
  }

  /**
   * Find all video URLs in the page
   */
  private findVideoUrls(webpage: string, baseUrl: string): string[] {
    const urls = new Set<string>();

    // Apply all patterns
    for (const pattern of VIDEO_URL_PATTERNS) {
      const matches = webpage.matchAll(pattern);
      for (const match of matches) {
        const url = match[1];
        if (url && this.isValidVideoUrl(url)) {
          const resolvedUrl = this.resolveVideoUrl(url, baseUrl);
          if (resolvedUrl) {
            urls.add(resolvedUrl);
          }
        }
      }
    }

    // Also check for JSON-LD
    const jsonLdUrls = this.extractFromJsonLd(webpage);
    for (const url of jsonLdUrls) {
      urls.add(url);
    }

    // Check for common video embedding patterns
    const embedUrls = this.extractFromEmbeds(webpage);
    for (const url of embedUrls) {
      urls.add(url);
    }

    return Array.from(urls);
  }

  /**
   * Check if URL is a valid video URL
   */
  private isValidVideoUrl(url: string): boolean {
    // Skip patterns
    for (const pattern of SKIP_PATTERNS) {
      if (pattern.test(url)) return false;
    }

    // Must have video extension or be a manifest
    const hasVideoExt = VIDEO_EXTENSIONS.some((ext) =>
      url.toLowerCase().includes(`.${ext}`)
    );
    const hasManifestExt = MANIFEST_EXTENSIONS.some((ext) =>
      url.toLowerCase().includes(`.${ext}`)
    );

    return hasVideoExt || hasManifestExt;
  }

  /**
   * Resolve relative URL to absolute (internal method)
   */
  private resolveVideoUrl(url: string, baseUrl: string): string | null {
    try {
      // Handle protocol-relative URLs
      if (url.startsWith('//')) {
        return `https:${url}`;
      }

      // Handle relative URLs
      if (!url.startsWith('http')) {
        return new URL(url, baseUrl).href;
      }

      return url;
    } catch {
      return null;
    }
  }

  /**
   * Extract video URLs from JSON-LD
   */
  private extractFromJsonLd(webpage: string): string[] {
    const urls: string[] = [];

    const jsonLdMatches = webpage.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    );

    for (const match of jsonLdMatches) {
      try {
        const data = JSON.parse(match[1]);
        const videoUrls = this.extractUrlsFromObject(data);
        urls.push(...videoUrls);
      } catch {
        // Ignore JSON parse errors
      }
    }

    return urls;
  }

  /**
   * Recursively extract video URLs from an object
   */
  private extractUrlsFromObject(obj: unknown): string[] {
    const urls: string[] = [];

    if (!obj || typeof obj !== 'object') return urls;

    if (Array.isArray(obj)) {
      for (const item of obj) {
        urls.push(...this.extractUrlsFromObject(item));
      }
      return urls;
    }

    const record = obj as Record<string, unknown>;

    // Check for video URL properties
    const urlProps = ['contentUrl', 'embedUrl', 'url', 'videoUrl', 'source'];
    for (const prop of urlProps) {
      const value = record[prop];
      if (typeof value === 'string' && this.isValidVideoUrl(value)) {
        urls.push(value);
      }
    }

    // Recurse into nested objects
    for (const value of Object.values(record)) {
      if (typeof value === 'object') {
        urls.push(...this.extractUrlsFromObject(value));
      }
    }

    return urls;
  }

  /**
   * Extract video URLs from embed patterns
   */
  private extractFromEmbeds(webpage: string): string[] {
    const urls: string[] = [];

    // JW Player
    const jwMatch = webpage.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)/i);
    if (jwMatch) urls.push(jwMatch[1]);

    // Video.js
    const vjsMatch = webpage.match(
      /sources\s*:\s*\[\s*\{\s*["']?src["']?\s*:\s*["']([^"']+)/i
    );
    if (vjsMatch) urls.push(vjsMatch[1]);

    // Flowplayer
    const fpMatch = webpage.match(/clip\s*:\s*\{\s*["']?url["']?\s*:\s*["']([^"']+)/i);
    if (fpMatch) urls.push(fpMatch[1]);

    // Generic player config
    const configMatch = webpage.match(
      /playerConfig\s*=\s*\{[\s\S]*?["']?url["']?\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)/i
    );
    if (configMatch) urls.push(configMatch[1]);

    return urls;
  }

  /**
   * Extract formats from video URLs
   */
  private async extractFormats(
    videoUrls: string[],
    videoId: string
  ): Promise<Format[]> {
    const formats: Format[] = [];
    const seenUrls = new Set<string>();

    for (const url of videoUrls) {
      if (seenUrls.has(url)) continue;
      seenUrls.add(url);

      const ext = this.getExtension(url);

      // Handle HLS
      if (ext === 'm3u8') {
        try {
          const hlsFormats = await this.extractM3U8Formats(url, videoId);
          formats.push(...hlsFormats);
        } catch {
          // Add as single format if extraction fails
          formats.push({
            url,
            formatId: 'hls',
            ext: 'm3u8',
            protocol: 'm3u8',
          });
        }
        continue;
      }

      // Handle DASH (placeholder for future)
      if (ext === 'mpd') {
        // TODO: Implement DASH support
        continue;
      }

      // Direct video URL
      const quality = this.extractQualityFromUrl(url);
      formats.push({
        url,
        formatId: quality ? `${ext}-${quality}` : ext || 'video',
        ext: ext || 'mp4',
        height: quality,
        protocol: url.startsWith('https') ? 'https' : 'http',
      });
    }

    // Sort by quality (highest first)
    formats.sort((a, b) => (b.height || 0) - (a.height || 0));

    return formats;
  }

  /**
   * Get file extension from URL
   */
  private getExtension(url: string): string | undefined {
    const match = url.match(/\.([a-z0-9]+)(?:[?#]|$)/i);
    return match?.[1]?.toLowerCase();
  }

  /**
   * Extract quality/height from URL
   */
  private extractQualityFromUrl(url: string): number | undefined {
    // Common patterns: 720p, 1080, _720_, etc.
    const match = url.match(/[_\-]?(\d{3,4})p?[_\-\.]/i);
    if (match) {
      const height = parseInt(match[1], 10);
      if (height >= 144 && height <= 4320) {
        return height;
      }
    }
    return undefined;
  }
}
