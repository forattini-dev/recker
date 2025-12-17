/**
 * PeerTube Extractor
 *
 * Extracts video information from PeerTube instances.
 * Federated video hosting platform (ActivityPub).
 *
 * @example
 * ```typescript
 * const extractor = new PeerTubeExtractor(client);
 * const info = await extractor.extract('https://instance.example/videos/watch/uuid');
 * ```
 */

import {
  BaseExtractor,
  ExtractorResult,
  ExtractorError,
  Format,
} from './base.js';

interface PeerTubeVideo {
  id: number;
  uuid: string;
  shortUUID: string;
  name: string;
  description?: string;
  duration: number;
  views: number;
  likes: number;
  dislikes: number;
  nsfw: boolean;
  publishedAt: string;
  originallyPublishedAt?: string;
  category?: {
    id: number;
    label: string;
  };
  licence?: {
    id: number;
    label: string;
  };
  language?: {
    id: string;
    label: string;
  };
  privacy: {
    id: number;
    label: string;
  };
  channel: {
    id: number;
    name: string;
    displayName: string;
    url: string;
    host: string;
  };
  account: {
    id: number;
    name: string;
    displayName: string;
    url: string;
    host: string;
  };
  thumbnailPath?: string;
  previewPath?: string;
  files?: PeerTubeFile[];
  streamingPlaylists?: PeerTubePlaylist[];
  isLive?: boolean;
}

interface PeerTubeFile {
  id: number;
  resolution: {
    id: number;
    label: string;
  };
  magnetUri?: string;
  size: number;
  fps?: number;
  fileUrl: string;
  fileDownloadUrl: string;
  torrentUrl?: string;
  torrentDownloadUrl?: string;
  metadataUrl?: string;
}

interface PeerTubePlaylist {
  id: number;
  type: number;
  playlistUrl: string;
  segmentsSha256Url?: string;
  files: PeerTubeFile[];
  redundancies?: Array<{
    baseUrl: string;
  }>;
}

export class PeerTubeExtractor extends BaseExtractor {
  readonly VALID_URL = [
    // Standard video watch URLs
    /https?:\/\/(?<host>[^\/]+)\/(?:videos\/)?(?:watch|w)\/(?<id>[a-zA-Z0-9-]+)/,
    // Video embed URLs
    /https?:\/\/(?<embed_host>[^\/]+)\/videos\/embed\/(?<embed_id>[a-zA-Z0-9-]+)/,
    // API URLs
    /https?:\/\/(?<api_host>[^\/]+)\/api\/v\d+\/videos\/(?<api_id>[a-zA-Z0-9-]+)/,
  ];
  readonly IE_NAME = 'peertube';
  readonly AGE_LIMIT = 0;

  async extract(url: string): Promise<ExtractorResult> {
    const { host, videoId } = this.extractInfo(url);

    if (!host || !videoId) {
      throw new ExtractorError('Could not extract instance/video ID from URL');
    }

    // Get video info from API
    const video = await this.getVideoData(host, videoId);

    if (!video) {
      throw new ExtractorError('Could not fetch video data');
    }

    const formats = this.buildFormats(video, host);

    if (formats.length === 0) {
      throw new ExtractorError('No playable formats found');
    }

    const thumbnail = video.previewPath
      ? `https://${host}${video.previewPath}`
      : video.thumbnailPath
        ? `https://${host}${video.thumbnailPath}`
        : undefined;

    return {
      id: video.uuid,
      title: video.name,
      description: video.description,
      uploader: video.channel?.displayName || video.account?.displayName,
      uploaderId: video.channel?.name || video.account?.name,
      thumbnail,
      duration: video.duration,
      viewCount: video.views,
      likeCount: video.likes,
      isLive: video.isLive || false,
      formats,
    };
  }

  /**
   * Extract host and video ID from URL
   */
  private extractInfo(url: string): { host?: string; videoId?: string } {
    // Parse URL
    try {
      const parsed = new URL(url);
      const host = parsed.host;

      // Extract video ID
      let match = url.match(/\/(?:videos\/)?(?:watch|w)\/([a-zA-Z0-9-]+)/);
      if (match) {
        return { host, videoId: match[1] };
      }

      match = url.match(/\/videos\/embed\/([a-zA-Z0-9-]+)/);
      if (match) {
        return { host, videoId: match[1] };
      }

      match = url.match(/\/api\/v\d+\/videos\/([a-zA-Z0-9-]+)/);
      if (match) {
        return { host, videoId: match[1] };
      }
    } catch {
      // Ignore
    }

    return {};
  }

  /**
   * Get video data from PeerTube API
   */
  private async getVideoData(host: string, videoId: string): Promise<PeerTubeVideo | null> {
    try {
      const response = await this.client.get(
        `https://${host}/api/v1/videos/${videoId}`,
        {
          headers: this.getHeaders(),
        }
      ).json<PeerTubeVideo>();

      return response;
    } catch {
      return null;
    }
  }

  /**
   * Build format list
   */
  private buildFormats(video: PeerTubeVideo, host: string): Format[] {
    const formats: Format[] = [];

    // Direct video files (WebTorrent/webtorrent)
    if (video.files) {
      for (const file of video.files) {
        formats.push({
          url: file.fileUrl,
          formatId: `webtorrent-${file.resolution.id}p`,
          ext: 'mp4',
          protocol: 'https',
          height: file.resolution.id,
          fps: file.fps,
          formatNote: `${file.resolution.label} (WebTorrent)`,
        });
      }
    }

    // HLS streaming playlists
    if (video.streamingPlaylists) {
      for (const playlist of video.streamingPlaylists) {
        // Master playlist
        formats.push({
          url: playlist.playlistUrl,
          formatId: 'hls-master',
          ext: 'm3u8',
          protocol: 'm3u8',
          formatNote: 'HLS (Adaptive)',
        });

        // Individual resolutions from playlist
        for (const file of playlist.files || []) {
          formats.push({
            url: file.fileUrl,
            formatId: `hls-${file.resolution.id}p`,
            ext: 'mp4',
            protocol: 'https',
            height: file.resolution.id,
            fps: file.fps,
            formatNote: `${file.resolution.label} (HLS)`,
          });
        }

        // Add redundancy URLs if available
        for (const redundancy of playlist.redundancies || []) {
          formats.push({
            url: `${redundancy.baseUrl}/master.m3u8`,
            formatId: 'hls-redundancy',
            ext: 'm3u8',
            protocol: 'm3u8',
            formatNote: 'HLS (Redundancy)',
          });
        }
      }
    }

    // Sort by height (highest first)
    formats.sort((a, b) => (b.height || 0) - (a.height || 0));

    return formats;
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
