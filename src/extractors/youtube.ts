/**
 * YouTube Extractor
 *
 * Extracts video information from YouTube.
 * Supports regular videos, shorts, and live streams.
 *
 * @example
 * ```typescript
 * const extractor = new YouTubeExtractor(client);
 * const info = await extractor.extract('https://youtube.com/watch?v=dQw4w9WgXcQ');
 * ```
 */

import {
  BaseExtractor,
  ExtractorResult,
  ExtractorError,
  Format,
} from './base.js';

// YouTube player response types
interface YouTubeFormat {
  itag: number;
  url?: string;
  signatureCipher?: string;
  cipher?: string;
  mimeType: string;
  bitrate?: number;
  width?: number;
  height?: number;
  contentLength?: string;
  quality: string;
  qualityLabel?: string;
  audioQuality?: string;
  fps?: number;
}

interface YouTubePlayerResponse {
  videoDetails?: {
    videoId: string;
    title: string;
    lengthSeconds: string;
    channelId: string;
    shortDescription: string;
    thumbnail: { thumbnails: Array<{ url: string; width: number; height: number }> };
    viewCount: string;
    author: string;
    isLiveContent: boolean;
    isLive?: boolean;
  };
  streamingData?: {
    formats: YouTubeFormat[];
    adaptiveFormats: YouTubeFormat[];
    hlsManifestUrl?: string;
    dashManifestUrl?: string;
    expiresInSeconds: string;
  };
  playabilityStatus?: {
    status: string;
    reason?: string;
    playableInEmbed?: boolean;
    liveStreamability?: {
      liveStreamabilityRenderer: {
        videoId: string;
        offlineSlate?: object;
      };
    };
  };
}

export class YouTubeExtractor extends BaseExtractor {
  readonly VALID_URL = [
    // Standard watch URLs
    /https?:\/\/(?:www\.|m\.)?youtube\.com\/watch\?(?:.*&)?v=(?<id>[a-zA-Z0-9_-]{11})/,
    // Short URLs
    /https?:\/\/youtu\.be\/(?<id>[a-zA-Z0-9_-]{11})/,
    // Shorts
    /https?:\/\/(?:www\.|m\.)?youtube\.com\/shorts\/(?<id>[a-zA-Z0-9_-]{11})/,
    // Embed URLs
    /https?:\/\/(?:www\.)?youtube\.com\/embed\/(?<id>[a-zA-Z0-9_-]{11})/,
    // Live URLs
    /https?:\/\/(?:www\.|m\.)?youtube\.com\/live\/(?<id>[a-zA-Z0-9_-]{11})/,
  ];
  readonly IE_NAME = 'youtube';
  readonly AGE_LIMIT = 0;

  async extract(url: string): Promise<ExtractorResult> {
    const videoId = this.extractVideoId(url);
    if (!videoId) {
      throw new ExtractorError('Could not extract video ID from URL');
    }

    // Try multiple extraction methods
    let playerResponse = await this.getPlayerResponse(videoId);

    if (!playerResponse) {
      // Fallback: try extracting from webpage
      playerResponse = await this.extractFromWebpage(videoId);
    }

    if (!playerResponse?.videoDetails) {
      throw new ExtractorError('Could not get video details');
    }

    const { videoDetails, streamingData, playabilityStatus } = playerResponse;

    // Check playability
    if (playabilityStatus?.status === 'ERROR') {
      throw new ExtractorError(playabilityStatus.reason || 'Video is not available');
    }

    if (playabilityStatus?.status === 'LOGIN_REQUIRED') {
      throw new ExtractorError('This video requires login');
    }

    if (playabilityStatus?.status === 'UNPLAYABLE') {
      throw new ExtractorError(playabilityStatus.reason || 'Video is unplayable');
    }

    // Extract formats
    const formats: Format[] = [];
    const isLive = videoDetails.isLive || videoDetails.isLiveContent;

    // For live streams, prefer HLS
    if (isLive && streamingData?.hlsManifestUrl) {
      formats.push({
        url: streamingData.hlsManifestUrl,
        formatId: 'hls-live',
        ext: 'm3u8',
        protocol: 'm3u8',
        quality: 0,
      });
    }

    // Add regular formats
    if (streamingData?.formats) {
      for (const fmt of streamingData.formats) {
        const format = this.parseFormat(fmt);
        if (format) formats.push(format);
      }
    }

    // Add adaptive formats (video-only and audio-only)
    if (streamingData?.adaptiveFormats) {
      for (const fmt of streamingData.adaptiveFormats) {
        const format = this.parseFormat(fmt);
        if (format) formats.push(format);
      }
    }

    // Sort by quality
    formats.sort((a, b) => (b.height || b.bandwidth || 0) - (a.height || a.bandwidth || 0));

    if (formats.length === 0) {
      throw new ExtractorError('No playable formats found');
    }

    // Get best thumbnail
    const thumbnails = videoDetails.thumbnail?.thumbnails || [];
    const bestThumb = thumbnails[thumbnails.length - 1];

    return {
      id: videoId,
      title: videoDetails.title,
      description: videoDetails.shortDescription,
      thumbnail: bestThumb?.url,
      duration: parseInt(videoDetails.lengthSeconds, 10) || undefined,
      uploader: videoDetails.author,
      uploaderId: videoDetails.channelId,
      viewCount: parseInt(videoDetails.viewCount, 10) || undefined,
      isLive,
      ageLimit: this.AGE_LIMIT,
      formats,
    };
  }

  /**
   * Extract video ID from various YouTube URL formats
   */
  private extractVideoId(url: string): string | null {
    for (const pattern of this.VALID_URL as RegExp[]) {
      const match = url.match(pattern);
      if (match?.groups?.id) {
        return match.groups.id;
      }
    }
    return null;
  }

  /**
   * Get player response via innertube API
   */
  private async getPlayerResponse(videoId: string): Promise<YouTubePlayerResponse | null> {
    try {
      // Use Android client for better format availability
      const payload = {
        videoId,
        context: {
          client: {
            clientName: 'ANDROID',
            clientVersion: '19.09.37',
            androidSdkVersion: 30,
            hl: 'en',
            gl: 'US',
            utcOffsetMinutes: 0,
          },
        },
        contentCheckOk: true,
        racyCheckOk: true,
      };

      const response = await this.client.post(
        'https://www.youtube.com/youtubei/v1/player?key=AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w',
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-YouTube-Client-Name': '3',
            'X-YouTube-Client-Version': '19.09.37',
            'Origin': 'https://www.youtube.com',
            'User-Agent': 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip',
          },
        }
      ).json<YouTubePlayerResponse>();

      return response;
    } catch {
      return null;
    }
  }

  /**
   * Extract player response from webpage (fallback)
   */
  private async extractFromWebpage(videoId: string): Promise<YouTubePlayerResponse | null> {
    try {
      const webpage = await this.downloadWebpage(`https://www.youtube.com/watch?v=${videoId}`);

      // Try to find ytInitialPlayerResponse
      const playerMatch = webpage.match(
        /ytInitialPlayerResponse\s*=\s*(\{.+?\})(?:;|<\/script>)/s
      );

      if (playerMatch) {
        try {
          return JSON.parse(playerMatch[1]);
        } catch {
          // JSON parse failed
        }
      }

      // Try to find player response in config
      const configMatch = webpage.match(
        /ytcfg\.set\s*\(\s*(\{.+?\})\s*\)/s
      );

      if (configMatch) {
        try {
          const config = JSON.parse(configMatch[1]);
          if (config.PLAYER_RESPONSE) {
            return JSON.parse(config.PLAYER_RESPONSE);
          }
        } catch {
          // JSON parse failed
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Parse YouTube format to our Format type
   */
  private parseFormat(ytFormat: YouTubeFormat): Format | null {
    // Skip formats without URL (need signature decryption)
    if (!ytFormat.url && (ytFormat.signatureCipher || ytFormat.cipher)) {
      // TODO: Implement signature decryption
      return null;
    }

    if (!ytFormat.url) {
      return null;
    }

    const mimeType = ytFormat.mimeType || '';
    const isVideo = mimeType.startsWith('video/');
    const isAudio = mimeType.startsWith('audio/');

    // Extract codec info
    const codecMatch = mimeType.match(/codecs="([^"]+)"/);
    const codecs = codecMatch?.[1];

    // Determine extension
    let ext = 'mp4';
    if (mimeType.includes('webm')) ext = 'webm';
    else if (mimeType.includes('mp4')) ext = 'mp4';
    else if (mimeType.includes('3gpp')) ext = '3gp';

    const format: Format = {
      url: ytFormat.url,
      formatId: `${ytFormat.itag}`,
      ext,
      protocol: 'https',
      quality: this.parseQuality(ytFormat.quality),
    };

    if (isVideo) {
      format.width = ytFormat.width;
      format.height = ytFormat.height;
      format.fps = ytFormat.fps;
    }

    if (ytFormat.bitrate) {
      format.bandwidth = ytFormat.bitrate;
    }

    if (codecs) {
      format.vcodec = isVideo ? codecs : undefined;
      format.acodec = isAudio ? codecs : undefined;
    }

    // Mark audio-only and video-only
    if (isAudio && !isVideo) {
      format.vcodec = 'none';
    }
    if (isVideo && !isAudio) {
      format.acodec = 'none';
    }

    return format;
  }

  /**
   * Parse quality string to number
   */
  private parseQuality(quality: string): number {
    const qualityMap: Record<string, number> = {
      'tiny': 144,
      'small': 240,
      'medium': 360,
      'large': 480,
      'hd720': 720,
      'hd1080': 1080,
      'hd1440': 1440,
      'hd2160': 2160,
      'highres': 4320,
    };
    return qualityMap[quality] || 0;
  }
}
