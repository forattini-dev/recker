/**
 * Kick Extractor
 *
 * Extracts video information from Kick.com.
 * Supports live streams, VODs, and clips.
 *
 * @example
 * ```typescript
 * const extractor = new KickExtractor(client);
 * // Live stream
 * const info = await extractor.extract('https://kick.com/xqc');
 * // VOD
 * const vod = await extractor.extract('https://kick.com/video/123456');
 * // Clip
 * const clip = await extractor.extract('https://kick.com/xqc?clip=clip_abc123');
 * ```
 */

import {
  BaseExtractor,
  ExtractorResult,
  ExtractorError,
  Format,
} from './base.js';

interface KickChannelData {
  id: number;
  slug: string;
  user: {
    id: number;
    username: string;
    bio?: string;
    profile_pic?: string;
  };
  livestream?: {
    id: number;
    slug: string;
    session_title: string;
    is_live: boolean;
    viewer_count: number;
    created_at: string;
    playback_url?: string;
    thumbnail?: { url: string };
    categories?: Array<{ name: string; slug: string }>;
  };
  recent_categories?: Array<{ name: string }>;
  verified?: boolean;
}

interface KickVideoData {
  id: number;
  slug: string;
  channel_id: number;
  created_at: string;
  updated_at: string;
  uuid: string;
  title: string;
  thumbnail?: string;
  duration: number;
  live_stream_id?: number;
  source: string;
  channel?: {
    slug: string;
    user: {
      username: string;
    };
  };
  views: number;
}

interface KickClipData {
  id: string;
  title: string;
  clip_url: string;
  thumbnail_url: string;
  duration: number;
  created_at: string;
  view_count: number;
  creator: {
    username: string;
  };
  channel: {
    slug: string;
    user: {
      username: string;
    };
  };
  category?: {
    name: string;
  };
}

export class KickExtractor extends BaseExtractor {
  readonly VALID_URL = [
    // Live streams (channel page)
    /https?:\/\/(?:www\.)?kick\.com\/(?<channel>[a-zA-Z0-9_-]+)(?:\?.*)?$/,
    // VODs
    /https?:\/\/(?:www\.)?kick\.com\/video\/(?<video_id>[a-zA-Z0-9-]+)/,
    // Clips (via URL parameter)
    /https?:\/\/(?:www\.)?kick\.com\/[^\/]+\?clip=(?<clip_id>[a-zA-Z0-9_-]+)/,
    // Direct clip URLs
    /https?:\/\/(?:www\.)?kick\.com\/[^\/]+\/clips\/(?<clip_slug>[a-zA-Z0-9_-]+)/,
  ];
  readonly IE_NAME = 'kick';
  readonly AGE_LIMIT = 0;

  async extract(url: string): Promise<ExtractorResult> {
    // Check URL type
    const videoMatch = url.match(/\/video\/([a-zA-Z0-9-]+)/);
    const clipMatch = url.match(/\?clip=([a-zA-Z0-9_-]+)/) || url.match(/\/clips\/([a-zA-Z0-9_-]+)/);
    const channelMatch = url.match(/kick\.com\/([a-zA-Z0-9_-]+)/);

    if (videoMatch) {
      return this.extractVideo(videoMatch[1]);
    }

    if (clipMatch) {
      const channel = channelMatch?.[1];
      return this.extractClip(clipMatch[1], channel);
    }

    if (channelMatch && !['video', 'clips', 'categories'].includes(channelMatch[1])) {
      return this.extractLive(channelMatch[1]);
    }

    throw new ExtractorError('Could not determine content type from URL');
  }

  /**
   * Extract live stream
   */
  private async extractLive(channelSlug: string): Promise<ExtractorResult> {
    const channelData = await this.getChannelData(channelSlug);

    if (!channelData) {
      throw new ExtractorError(`Channel not found: ${channelSlug}`);
    }

    const livestream = channelData.livestream;

    if (!livestream || !livestream.is_live) {
      throw new ExtractorError(`Channel ${channelSlug} is not live`);
    }

    const formats: Format[] = [];

    // Get playback URL
    if (livestream.playback_url) {
      formats.push({
        url: livestream.playback_url,
        formatId: 'hls-live',
        ext: 'm3u8',
        protocol: 'm3u8',
      });
    } else {
      // Try to construct HLS URL
      const hlsUrl = `https://fa723fc1b171.us-west-2.playback.live-video.net/api/video/v1/us-west-2.${channelData.id}.channel.${livestream.id}.m3u8`;
      formats.push({
        url: hlsUrl,
        formatId: 'hls-live',
        ext: 'm3u8',
        protocol: 'm3u8',
      });
    }

    return {
      id: livestream.id.toString(),
      title: livestream.session_title || `${channelData.user.username}'s Live Stream`,
      uploader: channelData.user.username,
      uploaderId: channelSlug,
      thumbnail: livestream.thumbnail?.url,
      viewCount: livestream.viewer_count,
      isLive: true,
      formats,
    };
  }

  /**
   * Extract VOD
   */
  private async extractVideo(videoId: string): Promise<ExtractorResult> {
    const videoData = await this.getVideoData(videoId);

    if (!videoData) {
      throw new ExtractorError('Video not found');
    }

    const formats: Format[] = [];

    // Video source is usually an HLS URL
    if (videoData.source) {
      formats.push({
        url: videoData.source,
        formatId: 'hls-vod',
        ext: 'm3u8',
        protocol: 'm3u8',
      });
    }

    if (formats.length === 0) {
      throw new ExtractorError('No playable formats found');
    }

    return {
      id: videoData.uuid || videoId,
      title: videoData.title,
      uploader: videoData.channel?.user?.username || 'Unknown',
      uploaderId: videoData.channel?.slug,
      thumbnail: videoData.thumbnail,
      duration: videoData.duration,
      viewCount: videoData.views,
      timestamp: new Date(videoData.created_at).getTime() / 1000,
      isLive: false,
      formats,
    };
  }

  /**
   * Extract clip
   */
  private async extractClip(clipId: string, channelSlug?: string): Promise<ExtractorResult> {
    const clipData = await this.getClipData(clipId, channelSlug);

    if (!clipData) {
      throw new ExtractorError('Clip not found');
    }

    const formats: Format[] = [];

    if (clipData.clip_url) {
      formats.push({
        url: clipData.clip_url,
        formatId: 'clip',
        ext: 'mp4',
        protocol: 'https',
      });
    }

    if (formats.length === 0) {
      throw new ExtractorError('No playable formats found');
    }

    return {
      id: clipData.id,
      title: clipData.title,
      uploader: clipData.channel?.user?.username || clipData.creator?.username,
      uploaderId: clipData.channel?.slug,
      thumbnail: clipData.thumbnail_url,
      duration: clipData.duration,
      viewCount: clipData.view_count,
      timestamp: new Date(clipData.created_at).getTime() / 1000,
      isLive: false,
      formats,
    };
  }

  /**
   * Get channel data
   */
  private async getChannelData(channelSlug: string): Promise<KickChannelData | null> {
    try {
      const response = await this.client.get(
        `https://kick.com/api/v2/channels/${channelSlug}`,
        {
          headers: this.getHeaders(),
        }
      ).json<KickChannelData>();

      return response;
    } catch {
      return null;
    }
  }

  /**
   * Get video data
   */
  private async getVideoData(videoId: string): Promise<KickVideoData | null> {
    try {
      const response = await this.client.get(
        `https://kick.com/api/v1/video/${videoId}`,
        {
          headers: this.getHeaders(),
        }
      ).json<KickVideoData>();

      return response;
    } catch {
      return null;
    }
  }

  /**
   * Get clip data
   */
  private async getClipData(clipId: string, channelSlug?: string): Promise<KickClipData | null> {
    try {
      // Try direct clip endpoint
      const response = await this.client.get(
        `https://kick.com/api/v2/clips/${clipId}`,
        {
          headers: this.getHeaders(),
        }
      ).json<KickClipData>();

      return response;
    } catch {
      // Try channel clips endpoint if channel is known
      if (channelSlug) {
        try {
          const response = await this.client.get(
            `https://kick.com/api/v2/channels/${channelSlug}/clips/${clipId}`,
            {
              headers: this.getHeaders(),
            }
          ).json<KickClipData>();

          return response;
        } catch {
          return null;
        }
      }
      return null;
    }
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
