/**
 * Bilibili Extractor
 *
 * Extracts video information from Bilibili.
 * Chinese video sharing platform (like YouTube of China).
 *
 * @example
 * ```typescript
 * const extractor = new BilibiliExtractor(client);
 * const info = await extractor.extract('https://www.bilibili.com/video/BV1xx411c7mD');
 * ```
 */

import {
  BaseExtractor,
  ExtractorResult,
  ExtractorError,
  Format,
} from './base.js';

interface BilibiliVideoInfo {
  bvid: string;
  aid: number;
  cid: number;
  title: string;
  desc: string;
  pic: string;
  duration: number;
  pubdate: number;
  owner: {
    mid: number;
    name: string;
  };
  stat: {
    view: number;
    danmaku: number;
    reply: number;
    favorite: number;
    coin: number;
    share: number;
    like: number;
  };
  pages?: Array<{
    cid: number;
    page: number;
    part: string;
    duration: number;
  }>;
}

interface BilibiliPlayUrl {
  quality: number;
  format: string;
  timelength: number;
  accept_format: string;
  accept_quality: number[];
  durl?: Array<{
    order: number;
    url: string;
    backup_url: string[];
    size: number;
    length: number;
  }>;
  dash?: {
    video: Array<{
      id: number;
      baseUrl: string;
      backupUrl: string[];
      bandwidth: number;
      mimeType: string;
      codecs: string;
      width: number;
      height: number;
      frameRate: string;
    }>;
    audio: Array<{
      id: number;
      baseUrl: string;
      backupUrl: string[];
      bandwidth: number;
      mimeType: string;
      codecs: string;
    }>;
  };
}

const QUALITY_MAP: Record<number, string> = {
  127: '8K',
  126: 'Dolby Vision',
  125: 'HDR',
  120: '4K',
  116: '1080P60',
  112: '1080P+',
  80: '1080P',
  74: '720P60',
  64: '720P',
  32: '480P',
  16: '360P',
};

export class BilibiliExtractor extends BaseExtractor {
  readonly VALID_URL = [
    // BV format (new)
    /https?:\/\/(?:www\.)?bilibili\.com\/video\/(?<bvid>BV[a-zA-Z0-9]+)/,
    // AV format (old)
    /https?:\/\/(?:www\.)?bilibili\.com\/video\/av(?<avid>\d+)/,
    // Short URL
    /https?:\/\/b23\.tv\/(?<short_id>[a-zA-Z0-9]+)/,
    // Mobile
    /https?:\/\/m\.bilibili\.com\/video\/(?<mobile_id>BV[a-zA-Z0-9]+|av\d+)/,
  ];
  readonly IE_NAME = 'bilibili';
  readonly AGE_LIMIT = 0;

  async extract(url: string): Promise<ExtractorResult> {
    // Handle short URLs
    if (url.includes('b23.tv')) {
      url = await this.resolveShortUrl(url);
    }

    const { bvid, avid } = this.extractIds(url);

    if (!bvid && !avid) {
      throw new ExtractorError('Could not extract video ID from URL');
    }

    // Get video info
    const videoInfo = await this.getVideoInfo(bvid, avid);

    if (!videoInfo) {
      throw new ExtractorError('Could not fetch video info');
    }

    // Get play URLs
    const playInfo = await this.getPlayUrl(videoInfo.bvid, videoInfo.cid);

    if (!playInfo) {
      throw new ExtractorError('Could not fetch play URLs');
    }

    const formats = this.buildFormats(playInfo);

    if (formats.length === 0) {
      throw new ExtractorError('No playable formats found');
    }

    return {
      id: videoInfo.bvid,
      title: videoInfo.title,
      description: videoInfo.desc,
      uploader: videoInfo.owner.name,
      uploaderId: String(videoInfo.owner.mid),
      thumbnail: videoInfo.pic,
      duration: videoInfo.duration,
      viewCount: videoInfo.stat.view,
      likeCount: videoInfo.stat.like,
      commentCount: videoInfo.stat.reply,
      isLive: false,
      formats,
    };
  }

  /**
   * Extract BV/AV IDs from URL
   */
  private extractIds(url: string): { bvid?: string; avid?: number } {
    const bvMatch = url.match(/BV([a-zA-Z0-9]+)/);
    if (bvMatch) {
      return { bvid: `BV${bvMatch[1]}` };
    }

    const avMatch = url.match(/av(\d+)/);
    if (avMatch) {
      return { avid: parseInt(avMatch[1], 10) };
    }

    return {};
  }

  /**
   * Resolve short URL
   */
  private async resolveShortUrl(url: string): Promise<string> {
    try {
      // Client follows redirects automatically, so we just need to get the final URL
      const response = await this.client.get(url, {
        headers: this.getHeaders(),
      });

      // The response URL after redirects
      return response.url || url;
    } catch {
      return url;
    }
  }

  /**
   * Get video info from API
   */
  private async getVideoInfo(bvid?: string, avid?: number): Promise<BilibiliVideoInfo | null> {
    try {
      let apiUrl = 'https://api.bilibili.com/x/web-interface/view?';

      if (bvid) {
        apiUrl += `bvid=${bvid}`;
      } else if (avid) {
        apiUrl += `aid=${avid}`;
      } else {
        return null;
      }

      const response = await this.client.get(apiUrl, {
        headers: this.getHeaders(),
      }).json<{ code: number; data: BilibiliVideoInfo }>();

      if (response.code !== 0) {
        return null;
      }

      return response.data;
    } catch {
      return null;
    }
  }

  /**
   * Get play URLs
   */
  private async getPlayUrl(bvid: string, cid: number): Promise<BilibiliPlayUrl | null> {
    try {
      // Try to get DASH format (better quality)
      const dashUrl = `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&fnval=4048&fourk=1`;

      const response = await this.client.get(dashUrl, {
        headers: this.getHeaders(),
      }).json<{ code: number; data: BilibiliPlayUrl }>();

      if (response.code === 0 && response.data) {
        return response.data;
      }

      // Fallback to FLV
      const flvUrl = `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&fnval=0`;

      const flvResponse = await this.client.get(flvUrl, {
        headers: this.getHeaders(),
      }).json<{ code: number; data: BilibiliPlayUrl }>();

      if (flvResponse.code === 0) {
        return flvResponse.data;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Build format list
   */
  private buildFormats(playInfo: BilibiliPlayUrl): Format[] {
    const formats: Format[] = [];

    // DASH formats (video + audio separate)
    if (playInfo.dash) {
      // Video tracks
      for (const video of playInfo.dash.video || []) {
        const qualityName = QUALITY_MAP[video.id] || `${video.height}p`;

        formats.push({
          url: video.baseUrl,
          formatId: `dash-video-${video.id}`,
          ext: video.mimeType?.includes('webm') ? 'webm' : 'mp4',
          protocol: 'https',
          width: video.width,
          height: video.height,
          bandwidth: video.bandwidth,
          vcodec: video.codecs,
          acodec: 'none',
          formatNote: qualityName,
        });
      }

      // Audio tracks
      for (const audio of playInfo.dash.audio || []) {
        formats.push({
          url: audio.baseUrl,
          formatId: `dash-audio-${audio.id}`,
          ext: audio.mimeType?.includes('webm') ? 'webm' : 'm4a',
          protocol: 'https',
          bandwidth: audio.bandwidth,
          vcodec: 'none',
          acodec: audio.codecs,
        });
      }
    }

    // FLV/MP4 formats (combined)
    if (playInfo.durl) {
      for (const segment of playInfo.durl) {
        formats.push({
          url: segment.url,
          formatId: `flv-${segment.order}`,
          ext: 'flv',
          protocol: 'https',
          formatNote: QUALITY_MAP[playInfo.quality] || `Quality ${playInfo.quality}`,
        });
      }
    }

    return formats;
  }

  /**
   * Get request headers
   */
  private getHeaders(): Record<string, string> {
    return {
      'Accept': 'application/json',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://www.bilibili.com/',
      'Origin': 'https://www.bilibili.com',
    };
  }
}
