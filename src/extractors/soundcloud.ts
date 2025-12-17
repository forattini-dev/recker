/**
 * SoundCloud Extractor
 *
 * Extracts audio information from SoundCloud.
 * Supports tracks, playlists, and sets.
 *
 * @example
 * ```typescript
 * const extractor = new SoundCloudExtractor(client);
 * const info = await extractor.extract('https://soundcloud.com/artist/track');
 * ```
 */

import {
  BaseExtractor,
  ExtractorResult,
  ExtractorError,
  Format,
} from './base.js';

interface SoundCloudTrack {
  id: number;
  title: string;
  description?: string;
  user: {
    id: number;
    username: string;
    permalink: string;
  };
  duration: number;
  artwork_url?: string;
  waveform_url?: string;
  playback_count?: number;
  likes_count?: number;
  comment_count?: number;
  created_at: string;
  genre?: string;
  media: {
    transcodings: Array<{
      url: string;
      preset: string;
      format: {
        protocol: string;
        mime_type: string;
      };
      quality: string;
    }>;
  };
}

export class SoundCloudExtractor extends BaseExtractor {
  readonly VALID_URL = [
    // Track URLs
    /https?:\/\/(?:www\.|m\.)?soundcloud\.com\/(?<user>[a-zA-Z0-9_-]+)\/(?<track>[a-zA-Z0-9_-]+)(?:\?.*)?$/,
    // Sets/Playlists
    /https?:\/\/(?:www\.|m\.)?soundcloud\.com\/(?<set_user>[a-zA-Z0-9_-]+)\/sets\/(?<set>[a-zA-Z0-9_-]+)/,
    // Private share links
    /https?:\/\/(?:www\.|m\.)?soundcloud\.com\/(?<private_user>[a-zA-Z0-9_-]+)\/(?<private_track>[a-zA-Z0-9_-]+)\/s-(?<secret>[a-zA-Z0-9]+)/,
    // Short URLs (on.soundcloud.com)
    /https?:\/\/on\.soundcloud\.com\/(?<short_id>[a-zA-Z0-9]+)/,
    // API URLs
    /https?:\/\/api(?:-v2)?\.soundcloud\.com\/tracks\/(?<api_id>\d+)/,
  ];
  readonly IE_NAME = 'soundcloud';
  readonly AGE_LIMIT = 0;

  private clientId: string | null = null;

  async extract(url: string): Promise<ExtractorResult> {
    // Resolve short URLs
    if (url.includes('on.soundcloud.com')) {
      url = await this.resolveShortUrl(url);
    }

    // Get client ID
    await this.ensureClientId();

    // Check if it's a set/playlist
    if (url.includes('/sets/')) {
      return this.extractPlaylist(url);
    }

    // Extract track
    const track = await this.resolveTrack(url);

    if (!track) {
      throw new ExtractorError('Could not resolve track');
    }

    const formats = await this.extractFormats(track);

    if (formats.length === 0) {
      throw new ExtractorError('No playable formats found');
    }

    return {
      id: String(track.id),
      title: track.title,
      description: track.description,
      uploader: track.user.username,
      uploaderId: track.user.permalink,
      thumbnail: this.getArtworkUrl(track.artwork_url),
      duration: Math.floor(track.duration / 1000),
      viewCount: track.playback_count,
      likeCount: track.likes_count,
      commentCount: track.comment_count,
      isLive: false,
      formats,
    };
  }

  /**
   * Resolve short URL
   */
  private async resolveShortUrl(url: string): Promise<string> {
    try {
      const html = await this.client.get(url, {
        headers: this.getHeaders(),
      }).text();

      const canonical = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/);
      if (canonical) {
        return canonical[1];
      }

      return url;
    } catch {
      return url;
    }
  }

  /**
   * Get or fetch client ID
   */
  private async ensureClientId(): Promise<void> {
    if (this.clientId) return;

    try {
      // Fetch the main page to find client_id
      const html = await this.client.get('https://soundcloud.com/', {
        headers: this.getHeaders(),
      }).text();

      // Find script URLs
      const scriptMatch = html.match(/src="(https:\/\/[^"]+\/assets\/[^"]+\.js)"/g);
      if (!scriptMatch) {
        throw new Error('Could not find script URLs');
      }

      // Try each script to find client_id
      for (const match of scriptMatch.slice(-3)) {
        const scriptUrl = match.match(/src="([^"]+)"/)?.[1];
        if (!scriptUrl) continue;

        try {
          const script = await this.client.get(scriptUrl).text();
          const clientIdMatch = script.match(/client_id:\s*"([a-zA-Z0-9]+)"/);
          if (clientIdMatch) {
            this.clientId = clientIdMatch[1];
            return;
          }
        } catch {
          continue;
        }
      }

      // Fallback: try known working client ID (may expire)
      this.clientId = 'iZIs9mchVcX5lhVRyQGGAYlNPVldzAoX';
    } catch {
      // Use fallback
      this.clientId = 'iZIs9mchVcX5lhVRyQGGAYlNPVldzAoX';
    }
  }

  /**
   * Resolve track URL to track data
   */
  private async resolveTrack(url: string): Promise<SoundCloudTrack | null> {
    try {
      const params = new URLSearchParams({
        url,
        client_id: this.clientId!,
      });

      const response = await this.client.get(
        `https://api-v2.soundcloud.com/resolve?${params}`,
        {
          headers: this.getHeaders(),
        }
      ).json<SoundCloudTrack>();

      return response;
    } catch {
      // Try to extract from webpage
      return this.extractFromWebpage(url);
    }
  }

  /**
   * Extract track data from webpage
   */
  private async extractFromWebpage(url: string): Promise<SoundCloudTrack | null> {
    try {
      const html = await this.downloadWebpage(url);

      // Find hydration data
      const hydrationMatch = html.match(/<script>window\.__sc_hydration\s*=\s*(\[.+?\]);<\/script>/);
      if (!hydrationMatch) return null;

      const hydration = JSON.parse(hydrationMatch[1]);

      // Find track data
      for (const item of hydration) {
        if (item.hydratable === 'sound' && item.data) {
          return item.data as SoundCloudTrack;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Extract playlist
   */
  private async extractPlaylist(url: string): Promise<ExtractorResult> {
    await this.ensureClientId();

    const params = new URLSearchParams({
      url,
      client_id: this.clientId!,
    });

    const playlist = await this.client.get(
      `https://api-v2.soundcloud.com/resolve?${params}`,
      {
        headers: this.getHeaders(),
      }
    ).json<any>();

    if (!playlist.tracks || playlist.tracks.length === 0) {
      throw new ExtractorError('Playlist has no tracks');
    }

    // Get first track for format info
    const firstTrack = playlist.tracks[0] as SoundCloudTrack;
    const formats = await this.extractFormats(firstTrack);

    return {
      id: String(playlist.id),
      title: playlist.title,
      description: playlist.description,
      uploader: playlist.user?.username,
      uploaderId: playlist.user?.permalink,
      thumbnail: this.getArtworkUrl(playlist.artwork_url),
      isLive: false,
      formats,
    };
  }

  /**
   * Extract formats from track
   */
  private async extractFormats(track: SoundCloudTrack): Promise<Format[]> {
    const formats: Format[] = [];

    if (!track.media?.transcodings) {
      return formats;
    }

    for (const transcoding of track.media.transcodings) {
      const format = await this.resolveTranscoding(transcoding);
      if (format) {
        formats.push(format);
      }
    }

    // Sort: progressive (direct) first, then HLS
    formats.sort((a, b) => {
      if (a.protocol === 'https' && b.protocol !== 'https') return -1;
      if (a.protocol !== 'https' && b.protocol === 'https') return 1;
      return (b.bandwidth || 0) - (a.bandwidth || 0);
    });

    return formats;
  }

  /**
   * Resolve transcoding URL
   */
  private async resolveTranscoding(transcoding: SoundCloudTrack['media']['transcodings'][0]): Promise<Format | null> {
    try {
      const params = new URLSearchParams({
        client_id: this.clientId!,
      });

      const response = await this.client.get(
        `${transcoding.url}?${params}`,
        {
          headers: this.getHeaders(),
        }
      ).json<{ url: string }>();

      const isHls = transcoding.format.protocol === 'hls';
      const isMp3 = transcoding.format.mime_type.includes('mpeg');

      return {
        url: response.url,
        formatId: `${transcoding.preset}-${transcoding.quality}`,
        ext: isHls ? 'm3u8' : (isMp3 ? 'mp3' : 'opus'),
        protocol: isHls ? 'm3u8' : 'https',
        acodec: isMp3 ? 'mp3' : 'opus',
      };
    } catch {
      return null;
    }
  }

  /**
   * Get high-quality artwork URL
   */
  private getArtworkUrl(url?: string): string | undefined {
    if (!url) return undefined;
    // Replace with largest size
    return url.replace('-large', '-t500x500');
  }

  /**
   * Get request headers
   */
  private getHeaders(): Record<string, string> {
    return {
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'Accept-Language': 'en-US,en;q=0.5',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Origin': 'https://soundcloud.com',
      'Referer': 'https://soundcloud.com/',
    };
  }
}
