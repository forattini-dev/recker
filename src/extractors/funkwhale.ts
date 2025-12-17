/**
 * Funkwhale Extractor
 *
 * Extracts audio information from Funkwhale instances.
 * Federated audio hosting platform (ActivityPub).
 *
 * @example
 * ```typescript
 * const extractor = new FunkwhaleExtractor(client);
 * const info = await extractor.extract('https://instance.example/library/tracks/123');
 * ```
 */

import {
  BaseExtractor,
  ExtractorResult,
  ExtractorError,
  Format,
} from './base.js';

interface FunkwhaleTrack {
  id: number;
  fid?: string;
  mbid?: string;
  title: string;
  position?: number;
  disc_number?: number;
  copyright?: string;
  license?: string;
  creation_date: string;
  duration?: number;
  listen_url: string;
  downloads_count?: number;
  album?: {
    id: number;
    fid?: string;
    mbid?: string;
    title: string;
    release_date?: string;
    cover?: {
      original?: string;
      medium_square_crop?: string;
      small_square_crop?: string;
    };
    artist?: {
      id: number;
      name: string;
    };
  };
  artist?: {
    id: number;
    fid?: string;
    mbid?: string;
    name: string;
    creation_date?: string;
  };
  uploads?: FunkwhaleUpload[];
  tags?: string[];
}

interface FunkwhaleUpload {
  uuid: string;
  listen_url: string;
  size?: number;
  duration?: number;
  bitrate?: number;
  mimetype?: string;
  extension?: string;
}

interface FunkwhaleAlbum {
  id: number;
  title: string;
  artist: {
    id: number;
    name: string;
  };
  cover?: {
    original?: string;
  };
  tracks: FunkwhaleTrack[];
}

export class FunkwhaleExtractor extends BaseExtractor {
  readonly VALID_URL = [
    // Track URLs
    /https?:\/\/(?<host>[^\/]+)\/library\/tracks\/(?<track_id>\d+)/,
    // Album URLs
    /https?:\/\/(?<album_host>[^\/]+)\/library\/albums\/(?<album_id>\d+)/,
    // Artist URLs
    /https?:\/\/(?<artist_host>[^\/]+)\/library\/artists\/(?<artist_id>\d+)/,
    // Federation URLs
    /https?:\/\/(?<fed_host>[^\/]+)\/library\/(?<fed_type>tracks|albums)\/(?<fed_id>[a-f0-9-]+)/,
    // Channel URLs
    /https?:\/\/(?<channel_host>[^\/]+)\/channels\/(?<channel_id>[^\/]+)/,
  ];
  readonly IE_NAME = 'funkwhale';
  readonly AGE_LIMIT = 0;

  async extract(url: string): Promise<ExtractorResult> {
    const { host, type, id } = this.extractInfo(url);

    if (!host || !id) {
      throw new ExtractorError('Could not extract instance/ID from URL');
    }

    if (type === 'album') {
      return this.extractAlbum(host, id);
    }

    return this.extractTrack(host, id);
  }

  /**
   * Extract host, type and ID from URL
   */
  private extractInfo(url: string): { host?: string; type: string; id?: string } {
    try {
      const parsed = new URL(url);
      const host = parsed.host;

      // Track
      let match = url.match(/\/library\/tracks\/(\d+|[a-f0-9-]+)/);
      if (match) {
        return { host, type: 'track', id: match[1] };
      }

      // Album
      match = url.match(/\/library\/albums\/(\d+|[a-f0-9-]+)/);
      if (match) {
        return { host, type: 'album', id: match[1] };
      }

      // Channel (treat as artist for now)
      match = url.match(/\/channels\/([^\/]+)/);
      if (match) {
        return { host, type: 'channel', id: match[1] };
      }
    } catch {
      // Ignore
    }

    return { type: 'unknown' };
  }

  /**
   * Extract single track
   */
  private async extractTrack(host: string, trackId: string): Promise<ExtractorResult> {
    const track = await this.getTrackData(host, trackId);

    if (!track) {
      throw new ExtractorError('Could not fetch track data');
    }

    const formats = this.buildFormats(track, host);

    if (formats.length === 0) {
      throw new ExtractorError('No playable formats found');
    }

    const thumbnail = track.album?.cover?.medium_square_crop ||
                      track.album?.cover?.original;

    return {
      id: String(track.id),
      title: `${track.artist?.name || 'Unknown Artist'} - ${track.title}`,
      uploader: track.artist?.name,
      uploaderId: track.artist?.id ? String(track.artist.id) : undefined,
      thumbnail: thumbnail ? (thumbnail.startsWith('http') ? thumbnail : `https://${host}${thumbnail}`) : undefined,
      duration: track.duration,
      isLive: false,
      formats,
    };
  }

  /**
   * Extract album (returns first track)
   */
  private async extractAlbum(host: string, albumId: string): Promise<ExtractorResult> {
    const album = await this.getAlbumData(host, albumId);

    if (!album || album.tracks.length === 0) {
      throw new ExtractorError('Could not fetch album data or no tracks found');
    }

    // Use first track
    const firstTrack = album.tracks[0];
    const formats = this.buildFormats(firstTrack, host);

    if (formats.length === 0) {
      throw new ExtractorError('No playable formats found');
    }

    const thumbnail = album.cover?.original;

    return {
      id: String(album.id),
      title: `${album.artist?.name || 'Unknown Artist'} - ${album.title}`,
      uploader: album.artist?.name,
      uploaderId: album.artist?.id ? String(album.artist.id) : undefined,
      thumbnail: thumbnail ? (thumbnail.startsWith('http') ? thumbnail : `https://${host}${thumbnail}`) : undefined,
      duration: firstTrack.duration,
      isLive: false,
      formats,
    };
  }

  /**
   * Get track data from Funkwhale API
   */
  private async getTrackData(host: string, trackId: string): Promise<FunkwhaleTrack | null> {
    try {
      const response = await this.client.get(
        `https://${host}/api/v1/tracks/${trackId}`,
        {
          headers: this.getHeaders(),
        }
      ).json<FunkwhaleTrack>();

      return response;
    } catch {
      return null;
    }
  }

  /**
   * Get album data from Funkwhale API
   */
  private async getAlbumData(host: string, albumId: string): Promise<FunkwhaleAlbum | null> {
    try {
      const response = await this.client.get(
        `https://${host}/api/v1/albums/${albumId}`,
        {
          headers: this.getHeaders(),
        }
      ).json<FunkwhaleAlbum>();

      return response;
    } catch {
      return null;
    }
  }

  /**
   * Build format list
   */
  private buildFormats(track: FunkwhaleTrack, host: string): Format[] {
    const formats: Format[] = [];

    // Main listen URL
    if (track.listen_url) {
      const listenUrl = track.listen_url.startsWith('http')
        ? track.listen_url
        : `https://${host}${track.listen_url}`;

      formats.push({
        url: listenUrl,
        formatId: 'original',
        ext: 'mp3', // Will be determined by content-type
        protocol: 'https',
        acodec: 'mp3',
        formatNote: 'Original',
      });
    }

    // Individual uploads (different qualities/formats)
    if (track.uploads) {
      for (const upload of track.uploads) {
        const uploadUrl = upload.listen_url.startsWith('http')
          ? upload.listen_url
          : `https://${host}${upload.listen_url}`;

        // Skip if same as main URL
        if (formats.some(f => f.url === uploadUrl)) continue;

        const ext = upload.extension || this.guessExtension(upload.mimetype || '');
        const formatNote = upload.bitrate
          ? `${Math.round(upload.bitrate / 1000)}kbps`
          : upload.mimetype || '';

        formats.push({
          url: uploadUrl,
          formatId: `upload-${upload.uuid.slice(0, 8)}`,
          ext,
          protocol: 'https',
          bandwidth: upload.bitrate,
          acodec: this.guessCodec(upload.mimetype || ''),
          formatNote,
        });
      }
    }

    // Add transcoded versions (Funkwhale can transcode to different formats)
    // These use the listen_url with format parameter
    if (track.listen_url) {
      const baseUrl = track.listen_url.startsWith('http')
        ? track.listen_url
        : `https://${host}${track.listen_url}`;

      const transcodedFormats = [
        { format: 'mp3', bitrate: 320, codec: 'mp3' },
        { format: 'mp3', bitrate: 256, codec: 'mp3' },
        { format: 'ogg', bitrate: 192, codec: 'vorbis' },
      ];

      for (const transcode of transcodedFormats) {
        const url = `${baseUrl}?to=${transcode.format}&bitrate=${transcode.bitrate}`;

        formats.push({
          url,
          formatId: `${transcode.format}-${transcode.bitrate}`,
          ext: transcode.format,
          protocol: 'https',
          bandwidth: transcode.bitrate * 1000,
          acodec: transcode.codec,
          formatNote: `${transcode.format.toUpperCase()} ${transcode.bitrate}kbps (Transcoded)`,
        });
      }
    }

    return formats;
  }

  /**
   * Guess file extension from mimetype
   */
  private guessExtension(mimetype: string): string {
    const map: Record<string, string> = {
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'audio/ogg': 'ogg',
      'audio/flac': 'flac',
      'audio/x-flac': 'flac',
      'audio/wav': 'wav',
      'audio/x-wav': 'wav',
      'audio/aac': 'aac',
      'audio/mp4': 'm4a',
      'audio/opus': 'opus',
    };
    return map[mimetype] || 'mp3';
  }

  /**
   * Guess codec from mimetype
   */
  private guessCodec(mimetype: string): string {
    const map: Record<string, string> = {
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'audio/ogg': 'vorbis',
      'audio/flac': 'flac',
      'audio/x-flac': 'flac',
      'audio/wav': 'pcm',
      'audio/x-wav': 'pcm',
      'audio/aac': 'aac',
      'audio/mp4': 'aac',
      'audio/opus': 'opus',
    };
    return map[mimetype] || 'mp3';
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
