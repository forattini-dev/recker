/**
 * PornHub Extractor
 *
 * Extracts video URLs from PornHub and Thumbzilla
 *
 * @example
 * ```typescript
 * const extractor = new PornHubExtractor(client);
 * const info = await extractor.extract('https://www.pornhub.com/view_video.php?viewkey=abc123');
 * console.log(info.formats); // Multiple quality formats
 * ```
 */

import {
  BaseExtractor,
  ExtractorResult,
  ExtractorError,
  Format,
} from './base.js';

const AGE_COOKIES = {
  age_verified: '1',
  accessAgeDisclaimerPH: '1',
  accessAgeDisclaimerUK: '1',
  accessPH: '1',
};

interface FlashVars {
  video_duration?: number;
  image_url?: string;
  closedCaptionsFile?: string;
  mediaDefinitions?: MediaDefinition[];
}

interface MediaDefinition {
  videoUrl?: string;
  quality?: number | string;
  format?: string;
}

interface QualityItem {
  url?: string;
  quality?: number | string;
}

interface ModelProfile {
  username?: string;
  modelProfileLink?: string;
}

export class PornHubExtractor extends BaseExtractor {
  readonly VALID_URL =
    /https?:\/\/(?:(?:[^/]+\.)?pornhub(?:premium)?\.(?:com|net|org)|(?:www\.)?thumbzilla\.com)\/(?:(?:view_video\.php|video\/show)\?viewkey=|embed\/|video\/)(?<id>[\da-z]+)/i;
  readonly IE_NAME = 'pornhub';
  readonly AGE_LIMIT = 18;

  private cookies: Record<string, string> = {};

  async extract(url: string): Promise<ExtractorResult> {
    const match = this.matchUrl(url);
    if (!match?.groups) {
      throw new ExtractorError('Invalid PornHub URL');
    }

    const videoId = match.groups.id;
    const host = this.getHost(url);

    // Set age verification cookies
    this.setAgeCookies(host);

    // Set platform cookie for desktop version
    this.cookies['platform'] = 'pc';

    const webpage = await this.downloadWebpageWithCookies(
      `https://www.${host}/view_video.php?viewkey=${videoId}`,
      host
    );

    // Check for errors
    this.checkForErrors(webpage, videoId);

    // Extract title
    const title = this.extractTitle(webpage);

    // Extract flashvars JSON
    const flashvars = this.extractFlashVars(webpage, videoId);

    // Extract video URLs
    const videoUrls = this.extractVideoUrls(webpage, flashvars);

    // If no URLs found, try TV platform
    if (videoUrls.length === 0) {
      const tvWebpage = await this.downloadWebpageWithCookies(
        `https://www.${host}/view_video.php?viewkey=${videoId}`,
        host,
        'tv'
      );
      const tvUrls = this.extractVideoUrlsFromTv(tvWebpage);
      videoUrls.push(...tvUrls);
    }

    if (videoUrls.length === 0) {
      throw new ExtractorError('Could not find video URL');
    }

    // Extract formats from URLs
    const formats = await this.extractFormats(videoUrls, videoId);

    // Extract metadata
    const metadata = this.extractMetadata(webpage, flashvars);

    return {
      id: videoId,
      title,
      formats,
      thumbnail: flashvars?.image_url,
      duration: flashvars?.video_duration,
      viewCount: metadata.viewCount,
      likeCount: metadata.likeCount,
      dislikeCount: metadata.dislikeCount,
      uploader: metadata.uploader,
      uploaderId: metadata.uploaderId,
      uploadDate: metadata.uploadDate,
      ageLimit: this.AGE_LIMIT,
      tags: metadata.tags,
      categories: metadata.categories,
    };
  }

  /**
   * Get host from URL
   */
  private getHost(url: string): string {
    const match = url.match(
      /(?:pornhub(?:premium)?\.(?:com|net|org))/i
    );
    return match ? match[0] : 'pornhub.com';
  }

  /**
   * Set age verification cookies
   */
  private setAgeCookies(host: string): void {
    for (const [name, value] of Object.entries(AGE_COOKIES)) {
      this.cookies[name] = value;
    }
  }

  /**
   * Download webpage with cookies
   */
  private async downloadWebpageWithCookies(
    url: string,
    host: string,
    platform: string = 'pc'
  ): Promise<string> {
    this.cookies['platform'] = platform;

    const cookieHeader = Object.entries(this.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');

    const response = await this.client.get(url, {
      headers: {
        Cookie: cookieHeader,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
    });

    return response.text();
  }

  /**
   * Check for error messages in page
   */
  private checkForErrors(webpage: string, videoId: string): void {
    // Check for removed/unavailable video
    const errorMatch = webpage.match(
      /<div[^>]+class=["'][^"']*\b(?:removed|userMessageSection)\b[^"']*["'][^>]*>[\s\S]*?<\/div>|<section[^>]+class=["']noVideo["'][^>]*>[\s\S]*?<\/section>/i
    );

    if (errorMatch) {
      const errorMsg = this.cleanHtml(errorMatch[0]).replace(/\s+/g, ' ').trim();
      throw new ExtractorError(`PornHub said: ${errorMsg}`, true);
    }

    // Check for geo-blocked
    if (
      webpage.includes('class="geoBlocked"') ||
      webpage.includes('This content is unavailable in your country')
    ) {
      throw new ExtractorError('Content not available in your region', true);
    }

    // Check for locked/premium video
    if (webpage.match(/<[^>]+\bid=["']lockedPlayer/)) {
      throw new ExtractorError(`Video ${videoId} is locked (premium content)`, true);
    }
  }

  /**
   * Extract video title
   */
  private extractTitle(webpage: string): string {
    // Try twitter:title meta
    const twitterTitle = this.htmlSearchMeta('twitter:title', webpage);
    if (twitterTitle) return twitterTitle;

    // Try title patterns
    const patterns = [
      /<h1[^>]+class=["']title["'][^>]*>(?<title>.+?)<\/h1>/is,
      /<div[^>]+data-video-title=["'](?<title>[^"']+)["']/i,
      /shareTitle["']\s*[=:]\s*["'](?<title>[^"']+)["']/i,
    ];

    for (const pattern of patterns) {
      const match = webpage.match(pattern);
      if (match?.groups?.title) {
        return this.cleanHtml(match.groups.title);
      }
    }

    return 'Unknown Title';
  }

  /**
   * Extract flashvars JSON from page
   */
  private extractFlashVars(webpage: string, videoId: string): FlashVars | null {
    const match = webpage.match(/var\s+flashvars_\d+\s*=\s*(\{.+?\});/s);
    if (!match) return null;

    try {
      return JSON.parse(match[1]) as FlashVars;
    } catch {
      return null;
    }
  }

  /**
   * Extract video URLs from flashvars and page
   */
  private extractVideoUrls(
    webpage: string,
    flashvars: FlashVars | null
  ): Array<{ url: string; quality?: number }> {
    const urls: Array<{ url: string; quality?: number }> = [];
    const seenUrls = new Set<string>();

    const addUrl = (url: string, quality?: number) => {
      if (url && !seenUrls.has(url)) {
        seenUrls.add(url);
        urls.push({ url, quality });
      }
    };

    // Extract from flashvars mediaDefinitions
    if (flashvars?.mediaDefinitions) {
      for (const def of flashvars.mediaDefinitions) {
        if (def.videoUrl && typeof def.videoUrl === 'string') {
          const quality =
            typeof def.quality === 'number'
              ? def.quality
              : parseInt(String(def.quality), 10) || undefined;
          addUrl(def.videoUrl, quality);
        }
      }
    }

    // Extract from JavaScript variables
    const jsVars = this.extractJsVars(webpage);
    for (const [key, value] of Object.entries(jsVars)) {
      if (key.startsWith('qualityItems')) {
        // Parse quality items JSON
        try {
          const items = JSON.parse(value) as QualityItem[];
          for (const item of items) {
            if (item.url) {
              const quality =
                typeof item.quality === 'number'
                  ? item.quality
                  : parseInt(String(item.quality), 10) || undefined;
              addUrl(item.url, quality);
            }
          }
        } catch {
          // Ignore parse errors
        }
      } else if (key.startsWith('media') || key.startsWith('quality')) {
        addUrl(value);
      }
    }

    // Extract download button URLs
    const downloadMatches = webpage.matchAll(
      /<a[^>]+\bclass=["']downloadBtn\b[^>]+\bhref=["']([^"']+)["']/gi
    );
    for (const match of downloadMatches) {
      addUrl(match[1]);
    }

    return urls;
  }

  /**
   * Extract JavaScript variables from page
   */
  private extractJsVars(webpage: string): Record<string, string> {
    const vars: Record<string, string> = {};

    // Find variable assignments
    const pattern =
      /var\s+(?:media|quality|qualityItems)_[^=]+=\s*(?:"[^"]*"|'[^']*'|\{[^}]*\}|\[[^\]]*\])/g;
    const matches = webpage.matchAll(pattern);

    for (const match of matches) {
      const assignment = match[0];
      const eqIndex = assignment.indexOf('=');
      if (eqIndex === -1) continue;

      const varName = assignment.slice(4, eqIndex).trim();
      let value = assignment.slice(eqIndex + 1).trim();

      // Remove quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      vars[varName] = value;
    }

    return vars;
  }

  /**
   * Extract video URLs from TV platform page
   */
  private extractVideoUrlsFromTv(
    webpage: string
  ): Array<{ url: string; quality?: number }> {
    const urls: Array<{ url: string; quality?: number }> = [];

    // Look for mediastring variable
    const match = webpage.match(/mediastring\s*[=:]\s*["']([^"']+)["']/);
    if (match?.[1]) {
      urls.push({ url: match[1] });
    }

    return urls;
  }

  /**
   * Extract formats from video URLs
   */
  private async extractFormats(
    videoUrls: Array<{ url: string; quality?: number }>,
    videoId: string
  ): Promise<Format[]> {
    const formats: Format[] = [];

    for (const { url, quality } of videoUrls) {
      // Handle get_media API URLs
      if (url.includes('/video/get_media')) {
        try {
          const medias = await this.downloadJson<MediaDefinition[]>(url);
          if (Array.isArray(medias)) {
            for (const media of medias) {
              if (media.videoUrl) {
                const q =
                  typeof media.quality === 'number'
                    ? media.quality
                    : parseInt(String(media.quality), 10) || undefined;
                const fmts = await this.processVideoUrl(media.videoUrl, videoId, q);
                formats.push(...fmts);
              }
            }
          }
        } catch {
          // Ignore API errors
        }
        continue;
      }

      const fmts = await this.processVideoUrl(url, videoId, quality);
      formats.push(...fmts);
    }

    return formats;
  }

  /**
   * Process a video URL into formats
   */
  private async processVideoUrl(
    url: string,
    videoId: string,
    quality?: number
  ): Promise<Format[]> {
    const ext = this.getExtension(url);

    // Handle HLS
    if (ext === 'm3u8') {
      try {
        return await this.extractM3U8Formats(url, videoId);
      } catch {
        return [];
      }
    }

    // Handle DASH (not implemented yet, but structure for future)
    if (ext === 'mpd') {
      // TODO: Implement DASH support
      return [];
    }

    // Direct video URL
    const height = quality || this.extractHeightFromUrl(url);
    return [
      {
        url,
        formatId: height ? `${height}p` : 'unknown',
        ext: ext || 'mp4',
        height,
        protocol: url.startsWith('https') ? 'https' : 'http',
      },
    ];
  }

  /**
   * Extract height/quality from URL
   */
  private extractHeightFromUrl(url: string): number | undefined {
    const match = url.match(/(\d+)[pP]?_\d+[kK]/);
    return match ? parseInt(match[1], 10) : undefined;
  }

  /**
   * Get file extension from URL
   */
  private getExtension(url: string): string | undefined {
    const match = url.match(/\.([a-z0-9]+)(?:[?#]|$)/i);
    return match?.[1]?.toLowerCase();
  }

  /**
   * Extract metadata from page
   */
  private extractMetadata(
    webpage: string,
    flashvars: FlashVars | null
  ): {
    viewCount?: number;
    likeCount?: number;
    dislikeCount?: number;
    uploader?: string;
    uploaderId?: string;
    uploadDate?: string;
    tags: string[];
    categories: string[];
  } {
    // View count
    const viewMatch = webpage.match(
      /<span class="count">([\d,\.]+)<\/span>\s*[Vv]iews/
    );
    const viewCount = viewMatch ? this.parseCount(viewMatch[1]) : undefined;

    // Like/dislike counts
    const likeMatch = webpage.match(
      /<span[^>]+class="votesUp"[^>]*>([\d,\.]+)<\/span>|<span[^>]+class=["']votesUp["'][^>]*\bdata-rating=["'](\d+)/
    );
    const likeCount = likeMatch
      ? this.parseCount(likeMatch[1] || likeMatch[2])
      : undefined;

    const dislikeMatch = webpage.match(
      /<span[^>]+class="votesDown"[^>]*>([\d,\.]+)<\/span>|<span[^>]+class=["']votesDown["'][^>]*\bdata-rating=["'](\d+)/
    );
    const dislikeCount = dislikeMatch
      ? this.parseCount(dislikeMatch[1] || dislikeMatch[2])
      : undefined;

    // Uploader
    const uploaderMatch = webpage.match(
      /From:&nbsp;[\s\S]*?<(?:a\b[^>]+\bhref=["']\/(?:(?:user|channel)s|model|pornstar)\/|span\b[^>]+\bclass=["']username)[^>]+>(.+?)</
    );
    const uploader = uploaderMatch ? this.cleanHtml(uploaderMatch[1]) : undefined;

    // Model profile
    const modelProfile = this.extractModelProfile(webpage);
    const uploaderId = modelProfile?.modelProfileLink?.replace(/^\/model\//, '');

    // Upload date from video URL (format: /YYMMDD/DD/)
    let uploadDate: string | undefined;
    const dateMatch = webpage.match(/\/(\d{6}\/\d{2})\//);
    if (dateMatch) {
      uploadDate = dateMatch[1].replace('/', '');
    }

    // Tags
    const tags: string[] = [];
    const tagMatches = webpage.matchAll(/data-label=["']tag["'][^>]*>([^<]+)</gi);
    for (const match of tagMatches) {
      tags.push(this.cleanHtml(match[1]));
    }

    // Categories
    const categories: string[] = [];
    const catMatches = webpage.matchAll(
      /data-label=["']category["'][^>]*>([^<]+)</gi
    );
    for (const match of catMatches) {
      categories.push(this.cleanHtml(match[1]));
    }

    return {
      viewCount,
      likeCount,
      dislikeCount,
      uploader: uploader || modelProfile?.username,
      uploaderId,
      uploadDate,
      tags,
      categories,
    };
  }

  /**
   * Extract model profile from page
   */
  private extractModelProfile(webpage: string): ModelProfile | null {
    const match = webpage.match(/var\s+MODEL_PROFILE\s*=\s*(\{[^}]+\})/);
    if (!match) return null;

    try {
      return JSON.parse(match[1]) as ModelProfile;
    } catch {
      return null;
    }
  }
}
