/**
 * TikTok Extractor
 *
 * Extracts video information from TikTok.
 * Supports regular videos and live streams.
 *
 * @example
 * ```typescript
 * const extractor = new TikTokExtractor(client);
 * const info = await extractor.extract('https://tiktok.com/@user/video/123456789');
 * ```
 */

import {
  BaseExtractor,
  ExtractorResult,
  ExtractorError,
  Format,
} from './base.js';

interface TikTokVideoData {
  id: string;
  desc: string;
  createTime: number;
  author: {
    id: string;
    uniqueId: string;
    nickname: string;
    avatarThumb: string;
  };
  video: {
    id: string;
    height: number;
    width: number;
    duration: number;
    ratio: string;
    cover: string;
    playAddr: string;
    downloadAddr: string;
    bitrateInfo?: Array<{
      GearName: string;
      Bitrate: number;
      QualityType: number;
      PlayAddr: { UrlList: string[] };
    }>;
  };
  stats: {
    diggCount: number;
    shareCount: number;
    commentCount: number;
    playCount: number;
  };
  music?: {
    id: string;
    title: string;
    authorName: string;
  };
}

export class TikTokExtractor extends BaseExtractor {
  readonly VALID_URL = [
    // Standard video URLs
    /https?:\/\/(?:www\.|m\.)?tiktok\.com\/@(?<user>[^\/]+)\/video\/(?<id>\d+)/,
    // Short URLs (vm.tiktok.com)
    /https?:\/\/(?:vm|vt)\.tiktok\.com\/(?<short_id>[a-zA-Z0-9]+)/,
    // TikTok LIVE
    /https?:\/\/(?:www\.|m\.)?tiktok\.com\/@(?<live_user>[^\/]+)\/live/,
    // Web embed
    /https?:\/\/(?:www\.)?tiktok\.com\/embed\/v2\/(?<embed_id>\d+)/,
  ];
  readonly IE_NAME = 'tiktok';
  readonly AGE_LIMIT = 0;

  async extract(url: string): Promise<ExtractorResult> {
    // Handle short URLs (need to follow redirect)
    if (url.includes('vm.tiktok.com') || url.includes('vt.tiktok.com')) {
      url = await this.resolveShortUrl(url);
    }

    // Check if it's a live stream
    const liveMatch = url.match(/\/@([^\/]+)\/live/);
    if (liveMatch) {
      return this.extractLive(liveMatch[1]);
    }

    // Extract video ID
    const videoMatch = url.match(/\/video\/(\d+)/) || url.match(/\/embed\/v2\/(\d+)/);
    if (!videoMatch) {
      throw new ExtractorError('Could not extract video ID from URL');
    }

    const videoId = videoMatch[1];
    return this.extractVideo(videoId, url);
  }

  /**
   * Resolve short URL to full URL
   */
  private async resolveShortUrl(url: string): Promise<string> {
    try {
      // Fetch the page to find the canonical URL
      const html = await this.client.get(url, {
        headers: this.getHeaders(),
      }).text();

      // Look for canonical URL
      const canonical = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/);
      if (canonical) {
        return canonical[1];
      }

      // Look for og:url
      const ogUrl = html.match(/<meta[^>]+property="og:url"[^>]+content="([^"]+)"/);
      if (ogUrl) {
        return ogUrl[1];
      }

      return url;
    } catch {
      return url;
    }
  }

  /**
   * Extract video
   */
  private async extractVideo(videoId: string, originalUrl: string): Promise<ExtractorResult> {
    // Try multiple extraction methods
    let videoData = await this.extractViaWebpage(videoId, originalUrl);

    if (!videoData) {
      videoData = await this.extractViaApi(videoId);
    }

    if (!videoData) {
      throw new ExtractorError('Could not extract video data');
    }

    const formats: Format[] = [];

    // Add formats from bitrateInfo (multiple qualities)
    if (videoData.video.bitrateInfo) {
      for (const info of videoData.video.bitrateInfo) {
        const urls = info.PlayAddr?.UrlList || [];
        if (urls.length > 0) {
          formats.push({
            url: urls[0],
            formatId: `${info.GearName}-${info.Bitrate}`,
            ext: 'mp4',
            protocol: 'https',
            bandwidth: info.Bitrate,
            height: this.parseQualityLabel(info.GearName),
          });
        }
      }
    }

    // Add main video URL
    if (videoData.video.playAddr) {
      formats.push({
        url: videoData.video.playAddr,
        formatId: 'play',
        ext: 'mp4',
        protocol: 'https',
        width: videoData.video.width,
        height: videoData.video.height,
      });
    }

    // Add download URL (usually watermarked)
    if (videoData.video.downloadAddr && videoData.video.downloadAddr !== videoData.video.playAddr) {
      formats.push({
        url: videoData.video.downloadAddr,
        formatId: 'download-watermarked',
        ext: 'mp4',
        protocol: 'https',
        width: videoData.video.width,
        height: videoData.video.height,
      });
    }

    // Sort by quality
    formats.sort((a, b) => (b.height || 0) - (a.height || 0));

    if (formats.length === 0) {
      throw new ExtractorError('No playable formats found');
    }

    return {
      id: videoId,
      title: videoData.desc || `TikTok by @${videoData.author.uniqueId}`,
      description: videoData.desc,
      uploader: videoData.author.nickname,
      uploaderId: videoData.author.uniqueId,
      thumbnail: videoData.video.cover,
      duration: videoData.video.duration,
      viewCount: videoData.stats.playCount,
      likeCount: videoData.stats.diggCount,
      commentCount: videoData.stats.commentCount,
      isLive: false,
      formats,
    };
  }

  /**
   * Extract video data from webpage
   */
  private async extractViaWebpage(videoId: string, url: string): Promise<TikTokVideoData | null> {
    try {
      const webpage = await this.downloadWebpage(url);

      // Try to find SIGI_STATE (contains all video data)
      const sigiMatch = webpage.match(/<script[^>]+id="SIGI_STATE"[^>]*>([^<]+)<\/script>/);
      if (sigiMatch) {
        const data = JSON.parse(sigiMatch[1]);
        const itemModule = data.ItemModule || {};
        const videoData = itemModule[videoId];
        if (videoData) {
          return this.normalizeVideoData(videoData);
        }
      }

      // Try __UNIVERSAL_DATA_FOR_REHYDRATION__
      const universalMatch = webpage.match(/<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([^<]+)<\/script>/);
      if (universalMatch) {
        const data = JSON.parse(universalMatch[1]);
        const defaultScope = data['__DEFAULT_SCOPE__'];
        const itemDetail = defaultScope?.['webapp.video-detail']?.itemInfo?.itemStruct;
        if (itemDetail) {
          return this.normalizeVideoData(itemDetail);
        }
      }

      // Try NEXT_DATA
      const nextMatch = webpage.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/);
      if (nextMatch) {
        const data = JSON.parse(nextMatch[1]);
        const itemInfo = data.props?.pageProps?.itemInfo?.itemStruct;
        if (itemInfo) {
          return this.normalizeVideoData(itemInfo);
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Extract video data via API
   */
  private async extractViaApi(videoId: string): Promise<TikTokVideoData | null> {
    try {
      // Try the web API endpoint
      const params = new URLSearchParams({ itemId: videoId });
      const response = await this.client.get(
        `https://www.tiktok.com/api/item/detail/?${params}`,
        {
          headers: this.getHeaders(),
        }
      ).json<any>();

      if (response.itemInfo?.itemStruct) {
        return this.normalizeVideoData(response.itemInfo.itemStruct);
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Extract live stream
   */
  private async extractLive(username: string): Promise<ExtractorResult> {
    try {
      // Get room ID from webpage
      const webpage = await this.downloadWebpage(`https://www.tiktok.com/@${username}/live`);

      // Extract room info
      const roomMatch = webpage.match(/"roomId"\s*:\s*"(\d+)"/);
      if (!roomMatch) {
        throw new ExtractorError('Could not find live room ID - user may not be live');
      }

      const roomId = roomMatch[1];

      // Get stream URL
      const streamInfo = await this.getLiveStreamInfo(roomId);

      if (!streamInfo) {
        throw new ExtractorError('Could not get live stream info');
      }

      const formats: Format[] = [];

      // HLS stream
      if (streamInfo.hls_pull_url) {
        formats.push({
          url: streamInfo.hls_pull_url,
          formatId: 'hls',
          ext: 'm3u8',
          protocol: 'm3u8',
        });
      }

      // RTMP/FLV streams
      if (streamInfo.flv_pull_url) {
        for (const [quality, url] of Object.entries(streamInfo.flv_pull_url)) {
          formats.push({
            url: url as string,
            formatId: `flv-${quality}`,
            ext: 'flv',
            protocol: 'https',
          });
        }
      }

      if (formats.length === 0) {
        throw new ExtractorError('No live stream formats found');
      }

      return {
        id: roomId,
        title: streamInfo.title || `${username}'s Live`,
        uploader: username,
        uploaderId: username,
        thumbnail: streamInfo.cover,
        viewCount: streamInfo.user_count,
        isLive: true,
        formats,
      };
    } catch (e: any) {
      throw new ExtractorError(e.message || 'Could not extract live stream');
    }
  }

  /**
   * Get live stream info
   */
  private async getLiveStreamInfo(roomId: string): Promise<any | null> {
    try {
      const params = new URLSearchParams({ room_id: roomId });
      const response = await this.client.get(
        `https://webcast.tiktok.com/webcast/room/info/?${params}`,
        {
          headers: this.getHeaders(),
        }
      ).json<any>();

      if (!response.data) return null;

      const streamData = response.data.stream_url;

      return {
        title: response.data.title,
        cover: response.data.cover?.url_list?.[0],
        user_count: response.data.user_count,
        hls_pull_url: streamData?.hls_pull_url,
        flv_pull_url: streamData?.flv_pull_url,
      };
    } catch {
      return null;
    }
  }

  /**
   * Normalize video data from various sources
   */
  private normalizeVideoData(data: any): TikTokVideoData {
    return {
      id: data.id,
      desc: data.desc || data.description || '',
      createTime: data.createTime || Date.now() / 1000,
      author: {
        id: data.author?.id || '',
        uniqueId: data.author?.uniqueId || data.author?.unique_id || '',
        nickname: data.author?.nickname || '',
        avatarThumb: data.author?.avatarThumb || data.author?.avatar_thumb || '',
      },
      video: {
        id: data.video?.id || data.id,
        height: data.video?.height || 0,
        width: data.video?.width || 0,
        duration: data.video?.duration || 0,
        ratio: data.video?.ratio || '',
        cover: data.video?.cover || data.video?.originCover || '',
        playAddr: data.video?.playAddr || data.video?.play_addr?.url_list?.[0] || '',
        downloadAddr: data.video?.downloadAddr || data.video?.download_addr?.url_list?.[0] || '',
        bitrateInfo: data.video?.bitrateInfo || data.video?.bitrate_info,
      },
      stats: {
        diggCount: data.stats?.diggCount || data.stats?.digg_count || 0,
        shareCount: data.stats?.shareCount || data.stats?.share_count || 0,
        commentCount: data.stats?.commentCount || data.stats?.comment_count || 0,
        playCount: data.stats?.playCount || data.stats?.play_count || 0,
      },
      music: data.music ? {
        id: data.music.id,
        title: data.music.title,
        authorName: data.music.authorName || data.music.author,
      } : undefined,
    };
  }

  /**
   * Get request headers
   */
  private getHeaders(): Record<string, string> {
    return {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://www.tiktok.com/',
    };
  }

  /**
   * Parse quality label to height
   */
  private parseQualityLabel(label: string): number | undefined {
    const match = label.match(/(\d+)p/i);
    if (match) {
      return parseInt(match[1], 10);
    }

    const qualityMap: Record<string, number> = {
      'normal': 480,
      'lower': 360,
      'lowest': 240,
      'higher': 720,
      'highest': 1080,
    };

    return qualityMap[label.toLowerCase()];
  }
}
