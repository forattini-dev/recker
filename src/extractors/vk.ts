/**
 * VK (VKontakte) Extractor
 *
 * Extracts video information from VK.
 * Russian social network and video platform.
 *
 * @example
 * ```typescript
 * const extractor = new VKExtractor(client);
 * const info = await extractor.extract('https://vk.com/video-12345_67890');
 * ```
 */

import {
  BaseExtractor,
  ExtractorResult,
  ExtractorError,
  Format,
} from './base.js';

interface VKVideoInfo {
  id: number;
  owner_id: number;
  title: string;
  description?: string;
  duration: number;
  image?: string;
  first_frame?: Array<{ url: string; width: number; height: number }>;
  date: number;
  views?: number;
  comments?: number;
  player?: string;
  files?: Record<string, string>;
  live_status?: string;
  is_private?: number;
}

export class VKExtractor extends BaseExtractor {
  readonly VALID_URL = [
    // Standard video URLs
    /https?:\/\/(?:www\.)?vk\.com\/video(?<owner_id>-?\d+)_(?<video_id>\d+)/,
    // Video clip URLs
    /https?:\/\/(?:www\.)?vk\.com\/clip(?<clip_owner>-?\d+)_(?<clip_id>\d+)/,
    // Wall video
    /https?:\/\/(?:www\.)?vk\.com\/(?:[^\/]+\?.*?z=)?video(?<wall_owner>-?\d+)_(?<wall_id>\d+)/,
    // Short URLs
    /https?:\/\/vk\.cc\/(?<short_id>[a-zA-Z0-9]+)/,
  ];
  readonly IE_NAME = 'vk';
  readonly AGE_LIMIT = 0;

  async extract(url: string): Promise<ExtractorResult> {
    // Handle short URLs
    if (url.includes('vk.cc')) {
      url = await this.resolveShortUrl(url);
    }

    const { ownerId, videoId } = this.extractIds(url);

    if (!ownerId || !videoId) {
      throw new ExtractorError('Could not extract video ID from URL');
    }

    // Try to get video info via webpage
    const videoInfo = await this.getVideoInfo(ownerId, videoId);

    if (!videoInfo) {
      throw new ExtractorError('Could not fetch video info');
    }

    const formats = this.buildFormats(videoInfo);

    if (formats.length === 0) {
      throw new ExtractorError('No playable formats found');
    }

    const thumbnail = videoInfo.first_frame?.[0]?.url || videoInfo.image;

    return {
      id: `${ownerId}_${videoId}`,
      title: videoInfo.title || `VK Video ${ownerId}_${videoId}`,
      description: videoInfo.description,
      thumbnail,
      duration: videoInfo.duration,
      viewCount: videoInfo.views,
      commentCount: videoInfo.comments,
      isLive: videoInfo.live_status === 'started',
      formats,
    };
  }

  /**
   * Extract owner and video IDs from URL
   */
  private extractIds(url: string): { ownerId?: string; videoId?: string } {
    const match = url.match(/video(-?\d+)_(\d+)/) ||
                  url.match(/clip(-?\d+)_(\d+)/);

    if (match) {
      return {
        ownerId: match[1],
        videoId: match[2],
      };
    }

    return {};
  }

  /**
   * Resolve short URL
   */
  private async resolveShortUrl(url: string): Promise<string> {
    try {
      // Client follows redirects automatically
      const response = await this.client.get(url, {
        headers: this.getHeaders(),
      });
      return response.url || url;
    } catch {
      return url;
    }
  }

  /**
   * Get video info from webpage
   */
  private async getVideoInfo(ownerId: string, videoId: string): Promise<VKVideoInfo | null> {
    try {
      const html = await this.downloadWebpage(
        `https://vk.com/video${ownerId}_${videoId}`
      );

      // Extract video data from page
      return this.extractFromWebpage(html, ownerId, videoId);
    } catch {
      return null;
    }
  }

  /**
   * Extract video info from webpage HTML
   */
  private extractFromWebpage(html: string, ownerId: string, videoId: string): VKVideoInfo | null {
    const info: VKVideoInfo = {
      id: parseInt(videoId, 10),
      owner_id: parseInt(ownerId, 10),
      title: '',
      duration: 0,
      date: Date.now(),
      files: {},
    };

    // Try to find JSON data
    const jsonMatch = html.match(/var\s+playerParams\s*=\s*(\{.+?\});/s) ||
                      html.match(/"mvData"\s*:\s*(\{.+?\})/s) ||
                      html.match(/ajax\.preload\('al_video\.php'[^}]+\{[^}]*"video"\s*:\s*(\[.+?\])/s);

    if (jsonMatch) {
      try {
        const data = JSON.parse(jsonMatch[1]);
        if (data.params) {
          // playerParams format
          const params = data.params[0] || data.params;
          info.title = params.md_title || '';
          info.duration = params.duration || 0;

          // Extract video URLs
          for (const key of Object.keys(params)) {
            if (key.startsWith('url') && params[key]) {
              info.files![key] = params[key];
            }
          }
        }
      } catch {
        // Fall through to regex extraction
      }
    }

    // Fallback: extract title from page
    if (!info.title) {
      const titleMatch = html.match(/<title>([^<]+)<\/title>/) ||
                         html.match(/class="mv_title"[^>]*>([^<]+)</);
      if (titleMatch) {
        info.title = titleMatch[1]
          .replace(/\s*\|\s*VK$/, '')
          .trim();
      }
    }

    // Extract video URLs from page
    const urlPatterns = [
      /url(\d+)\s*[:=]\s*["']([^"']+\.mp4[^"']*)/g,
      /"url(\d+)"\s*:\s*"([^"]+)"/g,
      /https?:\/\/[^"'\s]+\.mp4[^"'\s]*/g,
    ];

    for (const pattern of urlPatterns) {
      const matches = html.matchAll(pattern);
      for (const match of matches) {
        if (match[2]) {
          info.files![`url${match[1]}`] = match[2].replace(/\\\//g, '/');
        } else if (match[0].includes('.mp4')) {
          // Direct URL match
          const cleanUrl = match[0].replace(/\\\//g, '/');
          if (!Object.values(info.files!).includes(cleanUrl)) {
            info.files![`url${Object.keys(info.files!).length}`] = cleanUrl;
          }
        }
      }
    }

    // Extract HLS URL
    const hlsMatch = html.match(/["']hls["']\s*:\s*["']([^"']+)["']/) ||
                     html.match(/hls_src\s*[:=]\s*["']([^"']+)/);
    if (hlsMatch) {
      info.files!['hls'] = hlsMatch[1].replace(/\\\//g, '/');
    }

    // Extract thumbnail
    const thumbMatch = html.match(/poster\s*[:=]\s*["']([^"']+)["']/) ||
                       html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/);
    if (thumbMatch) {
      info.image = thumbMatch[1].replace(/\\\//g, '/');
    }

    // Extract duration
    const durationMatch = html.match(/duration\s*[:=]\s*(\d+)/) ||
                          html.match(/"duration"\s*:\s*(\d+)/);
    if (durationMatch) {
      info.duration = parseInt(durationMatch[1], 10);
    }

    // Extract view count
    const viewsMatch = html.match(/(\d+)\s*(?:views|просмотр)/i) ||
                       html.match(/"views"\s*:\s*(\d+)/);
    if (viewsMatch) {
      info.views = parseInt(viewsMatch[1], 10);
    }

    // Check for live stream
    if (html.includes('live_status') && html.includes('started')) {
      info.live_status = 'started';
    }

    return Object.keys(info.files || {}).length > 0 || info.title ? info : null;
  }

  /**
   * Build format list
   */
  private buildFormats(videoInfo: VKVideoInfo): Format[] {
    const formats: Format[] = [];
    const files = videoInfo.files || {};

    // Quality mapping
    const qualityMap: Record<string, { height: number; label: string }> = {
      'url240': { height: 240, label: '240p' },
      'url360': { height: 360, label: '360p' },
      'url480': { height: 480, label: '480p' },
      'url720': { height: 720, label: '720p' },
      'url1080': { height: 1080, label: '1080p' },
      'url1440': { height: 1440, label: '1440p' },
      'url2160': { height: 2160, label: '4K' },
    };

    for (const [key, url] of Object.entries(files)) {
      if (!url) continue;

      if (key === 'hls') {
        formats.push({
          url,
          formatId: 'hls',
          ext: 'm3u8',
          protocol: 'm3u8',
        });
        continue;
      }

      const quality = qualityMap[key];
      if (quality) {
        formats.push({
          url,
          formatId: key,
          ext: 'mp4',
          protocol: 'https',
          height: quality.height,
          formatNote: quality.label,
        });
      } else if (url.includes('.mp4')) {
        // Unknown quality MP4
        formats.push({
          url,
          formatId: key,
          ext: 'mp4',
          protocol: 'https',
        });
      }
    }

    // Sort by quality (highest first)
    formats.sort((a, b) => (b.height || 0) - (a.height || 0));

    return formats;
  }

  /**
   * Get request headers
   */
  private getHeaders(): Record<string, string> {
    return {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };
  }
}
