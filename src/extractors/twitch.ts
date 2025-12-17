/**
 * Twitch Extractor
 *
 * Extracts video information from Twitch.
 * Supports live streams, VODs, and clips.
 *
 * @example
 * ```typescript
 * const extractor = new TwitchExtractor(client);
 * // Live stream
 * const info = await extractor.extract('https://twitch.tv/shroud');
 * // VOD
 * const vod = await extractor.extract('https://twitch.tv/videos/123456789');
 * // Clip
 * const clip = await extractor.extract('https://clips.twitch.tv/ClipSlug');
 * ```
 */

import {
  BaseExtractor,
  ExtractorResult,
  ExtractorError,
  Format,
} from './base.js';

const CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';

interface TwitchStreamData {
  id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  game_id: string;
  game_name: string;
  type: string;
  title: string;
  viewer_count: number;
  started_at: string;
  thumbnail_url: string;
}

interface TwitchVideoData {
  id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  title: string;
  description: string;
  created_at: string;
  published_at: string;
  url: string;
  thumbnail_url: string;
  viewable: string;
  view_count: number;
  language: string;
  type: string;
  duration: string;
}

interface TwitchClipData {
  id: string;
  url: string;
  embed_url: string;
  broadcaster_id: string;
  broadcaster_name: string;
  creator_id: string;
  creator_name: string;
  video_id: string;
  game_id: string;
  language: string;
  title: string;
  view_count: number;
  created_at: string;
  thumbnail_url: string;
  duration: number;
}

export class TwitchExtractor extends BaseExtractor {
  readonly VALID_URL = [
    // Live streams
    /https?:\/\/(?:www\.|go\.|m\.)?twitch\.tv\/(?<channel>[^\/\?\#]+)(?:\?.*)?$/,
    // VODs
    /https?:\/\/(?:www\.|go\.|m\.)?twitch\.tv\/videos\/(?<vod_id>\d+)/,
    // Clips (new format)
    /https?:\/\/(?:clips\.twitch\.tv|(?:www\.|go\.|m\.)?twitch\.tv\/[^\/]+\/clip)\/(?<clip_id>[^\/\?\#]+)/,
  ];
  readonly IE_NAME = 'twitch';
  readonly AGE_LIMIT = 0;

  async extract(url: string): Promise<ExtractorResult> {
    // Determine content type
    const vodMatch = url.match(/twitch\.tv\/videos\/(\d+)/);
    const clipMatch = url.match(/(?:clips\.twitch\.tv|\/clip)\/([^\/\?\#]+)/);
    const channelMatch = url.match(/twitch\.tv\/([^\/\?\#]+)/);

    if (vodMatch) {
      return this.extractVod(vodMatch[1]);
    }

    if (clipMatch) {
      return this.extractClip(clipMatch[1]);
    }

    if (channelMatch && !['videos', 'clips', 'about'].includes(channelMatch[1])) {
      return this.extractLive(channelMatch[1]);
    }

    throw new ExtractorError('Could not determine content type from URL');
  }

  /**
   * Extract live stream
   */
  private async extractLive(channel: string): Promise<ExtractorResult> {
    // Get stream info via GraphQL
    const streamData = await this.getStreamInfo(channel);

    if (!streamData) {
      throw new ExtractorError(`Channel ${channel} is not live`);
    }

    // Get stream playback access token
    const accessToken = await this.getStreamAccessToken(channel);

    if (!accessToken) {
      throw new ExtractorError('Could not get stream access token');
    }

    // Build HLS URL
    const hlsUrl = this.buildStreamUrl(channel, accessToken);

    // Get available qualities
    const formats = await this.extractHlsFormats(hlsUrl, channel);

    return {
      id: streamData.id,
      title: streamData.title,
      uploader: streamData.user_name,
      uploaderId: streamData.user_login,
      viewCount: streamData.viewer_count,
      thumbnail: streamData.thumbnail_url
        .replace('%{width}', '1920')
        .replace('%{height}', '1080'),
      isLive: true,
      formats,
    };
  }

  /**
   * Extract VOD
   */
  private async extractVod(vodId: string): Promise<ExtractorResult> {
    // Get VOD info via GraphQL
    const vodData = await this.getVodInfo(vodId);

    if (!vodData) {
      throw new ExtractorError('VOD not found or not accessible');
    }

    // Get VOD playback access token
    const accessToken = await this.getVodAccessToken(vodId);

    if (!accessToken) {
      throw new ExtractorError('Could not get VOD access token');
    }

    // Build HLS URL
    const hlsUrl = this.buildVodUrl(vodId, accessToken);

    // Get available qualities
    const formats = await this.extractHlsFormats(hlsUrl, vodId);

    return {
      id: vodId,
      title: vodData.title,
      description: vodData.description,
      uploader: vodData.user_name,
      uploaderId: vodData.user_login,
      viewCount: vodData.view_count,
      thumbnail: vodData.thumbnail_url
        .replace('%{width}', '1920')
        .replace('%{height}', '1080'),
      duration: this.parseTwitchDuration(vodData.duration),
      isLive: false,
      formats,
    };
  }

  /**
   * Extract clip
   */
  private async extractClip(clipId: string): Promise<ExtractorResult> {
    // Get clip info via GraphQL
    const clipData = await this.getClipInfo(clipId);

    if (!clipData) {
      throw new ExtractorError('Clip not found');
    }

    // Extract clip video URL from thumbnail
    // Clips have direct MP4 URLs derived from thumbnail
    const videoUrl = await this.getClipVideoUrl(clipId);

    const formats: Format[] = [];

    if (videoUrl) {
      formats.push({
        url: videoUrl,
        formatId: 'clip',
        ext: 'mp4',
        protocol: 'https',
      });
    }

    return {
      id: clipId,
      title: clipData.title,
      uploader: clipData.broadcaster_name,
      viewCount: clipData.view_count,
      thumbnail: clipData.thumbnail_url,
      duration: clipData.duration,
      isLive: false,
      formats,
    };
  }

  /**
   * Get stream info via GraphQL
   */
  private async getStreamInfo(channel: string): Promise<TwitchStreamData | null> {
    const query = `
      query {
        user(login: "${channel}") {
          stream {
            id
            title
            type
            viewersCount
            createdAt
            game {
              id
              name
            }
          }
          login
          displayName
        }
      }
    `;

    try {
      const response = await this.client.post(
        'https://gql.twitch.tv/gql',
        { query },
        {
          headers: {
            'Client-ID': CLIENT_ID,
            'Content-Type': 'application/json',
          },
        }
      ).json<any>();

      const user = response.data?.user;
      const stream = user?.stream;

      if (!stream || stream.type !== 'live') {
        return null;
      }

      return {
        id: stream.id,
        user_id: '',
        user_login: user.login,
        user_name: user.displayName,
        game_id: stream.game?.id || '',
        game_name: stream.game?.name || '',
        type: stream.type,
        title: stream.title,
        viewer_count: stream.viewersCount,
        started_at: stream.createdAt,
        thumbnail_url: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${user.login}-{width}x{height}.jpg`,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get VOD info via GraphQL
   */
  private async getVodInfo(vodId: string): Promise<TwitchVideoData | null> {
    const query = `
      query {
        video(id: "${vodId}") {
          id
          title
          description
          createdAt
          publishedAt
          lengthSeconds
          viewCount
          owner {
            login
            displayName
          }
          thumbnailURLs(width: 1920, height: 1080)
        }
      }
    `;

    try {
      const response = await this.client.post(
        'https://gql.twitch.tv/gql',
        { query },
        {
          headers: {
            'Client-ID': CLIENT_ID,
            'Content-Type': 'application/json',
          },
        }
      ).json<any>();

      const video = response.data?.video;
      if (!video) return null;

      return {
        id: video.id,
        user_id: '',
        user_login: video.owner?.login || '',
        user_name: video.owner?.displayName || '',
        title: video.title,
        description: video.description || '',
        created_at: video.createdAt,
        published_at: video.publishedAt,
        url: `https://www.twitch.tv/videos/${video.id}`,
        thumbnail_url: video.thumbnailURLs?.[0] || '',
        viewable: 'public',
        view_count: video.viewCount,
        language: '',
        type: 'archive',
        duration: `${Math.floor(video.lengthSeconds / 3600)}h${Math.floor((video.lengthSeconds % 3600) / 60)}m${video.lengthSeconds % 60}s`,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get clip info via GraphQL
   */
  private async getClipInfo(clipId: string): Promise<TwitchClipData | null> {
    const query = `
      query {
        clip(slug: "${clipId}") {
          id
          slug
          url
          title
          viewCount
          createdAt
          durationSeconds
          broadcaster {
            id
            login
            displayName
          }
          curator {
            id
            login
            displayName
          }
          thumbnailURL
          videoQualities {
            quality
            sourceURL
          }
        }
      }
    `;

    try {
      const response = await this.client.post(
        'https://gql.twitch.tv/gql',
        { query },
        {
          headers: {
            'Client-ID': CLIENT_ID,
            'Content-Type': 'application/json',
          },
        }
      ).json<any>();

      const clip = response.data?.clip;
      if (!clip) return null;

      return {
        id: clip.id,
        url: clip.url,
        embed_url: '',
        broadcaster_id: clip.broadcaster?.id || '',
        broadcaster_name: clip.broadcaster?.displayName || '',
        creator_id: clip.curator?.id || '',
        creator_name: clip.curator?.displayName || '',
        video_id: '',
        game_id: '',
        language: '',
        title: clip.title,
        view_count: clip.viewCount,
        created_at: clip.createdAt,
        thumbnail_url: clip.thumbnailURL,
        duration: clip.durationSeconds,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get stream access token
   */
  private async getStreamAccessToken(channel: string): Promise<{ token: string; sig: string } | null> {
    const query = `
      query {
        streamPlaybackAccessToken(channelName: "${channel}", params: {platform: "web", playerBackend: "mediaplayer", playerType: "site"}) {
          value
          signature
        }
      }
    `;

    try {
      const response = await this.client.post(
        'https://gql.twitch.tv/gql',
        { query },
        {
          headers: {
            'Client-ID': CLIENT_ID,
            'Content-Type': 'application/json',
          },
        }
      ).json<any>();

      const token = response.data?.streamPlaybackAccessToken;
      if (!token) return null;

      return {
        token: token.value,
        sig: token.signature,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get VOD access token
   */
  private async getVodAccessToken(vodId: string): Promise<{ token: string; sig: string } | null> {
    const query = `
      query {
        videoPlaybackAccessToken(id: "${vodId}", params: {platform: "web", playerBackend: "mediaplayer", playerType: "site"}) {
          value
          signature
        }
      }
    `;

    try {
      const response = await this.client.post(
        'https://gql.twitch.tv/gql',
        { query },
        {
          headers: {
            'Client-ID': CLIENT_ID,
            'Content-Type': 'application/json',
          },
        }
      ).json<any>();

      const token = response.data?.videoPlaybackAccessToken;
      if (!token) return null;

      return {
        token: token.value,
        sig: token.signature,
      };
    } catch {
      return null;
    }
  }

  /**
   * Build HLS URL for live stream
   */
  private buildStreamUrl(channel: string, accessToken: { token: string; sig: string }): string {
    const params = new URLSearchParams({
      token: accessToken.token,
      sig: accessToken.sig,
      allow_source: 'true',
      allow_audio_only: 'true',
      allow_spectre: 'true',
      player_backend: 'mediaplayer',
      playlist_include_framerate: 'true',
      p: String(Math.floor(Math.random() * 1000000)),
    });

    return `https://usher.ttvnw.net/api/channel/hls/${channel}.m3u8?${params}`;
  }

  /**
   * Build HLS URL for VOD
   */
  private buildVodUrl(vodId: string, accessToken: { token: string; sig: string }): string {
    const params = new URLSearchParams({
      token: accessToken.token,
      sig: accessToken.sig,
      allow_source: 'true',
      allow_audio_only: 'true',
      p: String(Math.floor(Math.random() * 1000000)),
    });

    return `https://usher.ttvnw.net/vod/${vodId}.m3u8?${params}`;
  }

  /**
   * Get clip video URL
   */
  private async getClipVideoUrl(clipId: string): Promise<string | null> {
    const query = `
      query {
        clip(slug: "${clipId}") {
          videoQualities {
            quality
            sourceURL
          }
        }
      }
    `;

    try {
      const response = await this.client.post(
        'https://gql.twitch.tv/gql',
        { query },
        {
          headers: {
            'Client-ID': CLIENT_ID,
            'Content-Type': 'application/json',
          },
        }
      ).json<any>();

      const qualities = response.data?.clip?.videoQualities;
      if (!qualities || qualities.length === 0) return null;

      // Get highest quality
      const sorted = [...qualities].sort((a: any, b: any) =>
        parseInt(b.quality) - parseInt(a.quality)
      );

      return sorted[0].sourceURL;
    } catch {
      return null;
    }
  }

  /**
   * Extract HLS formats from master playlist
   */
  private async extractHlsFormats(hlsUrl: string, videoId: string): Promise<Format[]> {
    try {
      const formats = await this.extractM3U8Formats(hlsUrl, videoId);
      return formats;
    } catch {
      // Return the master playlist URL as a single format
      return [{
        url: hlsUrl,
        formatId: 'hls',
        ext: 'm3u8',
        protocol: 'm3u8',
      }];
    }
  }

  /**
   * Parse Twitch duration format (e.g., "1h30m45s")
   */
  private parseTwitchDuration(duration: string): number {
    let seconds = 0;

    const hours = duration.match(/(\d+)h/);
    const minutes = duration.match(/(\d+)m/);
    const secs = duration.match(/(\d+)s/);

    if (hours) seconds += parseInt(hours[1], 10) * 3600;
    if (minutes) seconds += parseInt(minutes[1], 10) * 60;
    if (secs) seconds += parseInt(secs[1], 10);

    return seconds;
  }
}
