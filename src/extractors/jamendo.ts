/**
 * Jamendo Extractor
 *
 * Extracts audio information from Jamendo.
 * Free music platform with Creative Commons tracks.
 *
 * @example
 * ```typescript
 * const extractor = new JamendoExtractor(client);
 * const info = await extractor.extract('https://www.jamendo.com/track/123456/song-name');
 * ```
 */

import {
  BaseExtractor,
  ExtractorResult,
  ExtractorError,
  Format,
} from './base.js';

interface JamendoTrack {
  id: string;
  name: string;
  duration: number;
  artist_id: string;
  artist_name: string;
  artist_idstr: string;
  album_name?: string;
  album_id?: string;
  license_ccurl?: string;
  position?: number;
  releasedate?: string;
  album_image?: string;
  image?: string;
  audio?: string;
  audiodownload?: string;
  audiodownload_allowed?: boolean;
  shorturl?: string;
  shareurl?: string;
  stats?: {
    rate?: {
      total: number;
    };
    playlisted?: number;
    listened?: number;
  };
}

interface JamendoAlbum {
  id: string;
  name: string;
  artist_id: string;
  artist_name: string;
  image?: string;
  releasedate?: string;
  tracks?: JamendoTrack[];
}

export class JamendoExtractor extends BaseExtractor {
  readonly VALID_URL = [
    // Track URLs
    /https?:\/\/(?:www\.)?jamendo\.com\/track\/(?<track_id>\d+)(?:\/[^\/\?]*)?/,
    // Album URLs
    /https?:\/\/(?:www\.)?jamendo\.com\/album\/(?<album_id>\d+)(?:\/[^\/\?]*)?/,
    // Legacy track format
    /https?:\/\/(?:www\.)?jamendo\.com\/(?:en|fr|de|es|it)\/track\/(?<legacy_id>\d+)/,
  ];
  readonly IE_NAME = 'jamendo';
  readonly AGE_LIMIT = 0;

  // Public client ID for Jamendo API
  private readonly CLIENT_ID = '1b6f0ddd';

  async extract(url: string): Promise<ExtractorResult> {
    const { type, id } = this.extractInfo(url);

    if (!id) {
      throw new ExtractorError('Could not extract track/album ID from URL');
    }

    if (type === 'album') {
      return this.extractAlbum(id);
    }

    return this.extractTrack(id);
  }

  /**
   * Extract type and ID from URL
   */
  private extractInfo(url: string): { type: string; id?: string } {
    // Track
    let match = url.match(/\/track\/(\d+)/);
    if (match) {
      return { type: 'track', id: match[1] };
    }

    // Album
    match = url.match(/\/album\/(\d+)/);
    if (match) {
      return { type: 'album', id: match[1] };
    }

    return { type: 'unknown' };
  }

  /**
   * Extract single track
   */
  private async extractTrack(trackId: string): Promise<ExtractorResult> {
    const track = await this.getTrackData(trackId);

    if (!track) {
      throw new ExtractorError('Could not fetch track data');
    }

    const formats = this.buildFormats(track);

    if (formats.length === 0) {
      throw new ExtractorError('No playable formats found');
    }

    return {
      id: track.id,
      title: track.name,
      uploader: track.artist_name,
      uploaderId: track.artist_idstr || track.artist_id,
      thumbnail: track.image || track.album_image,
      duration: track.duration,
      viewCount: track.stats?.listened,
      isLive: false,
      formats,
    };
  }

  /**
   * Extract album (returns first track)
   */
  private async extractAlbum(albumId: string): Promise<ExtractorResult> {
    const album = await this.getAlbumData(albumId);

    if (!album || !album.tracks || album.tracks.length === 0) {
      throw new ExtractorError('Could not fetch album data');
    }

    // Use first track
    const firstTrack = album.tracks[0];
    const formats = this.buildFormats(firstTrack);

    if (formats.length === 0) {
      throw new ExtractorError('No playable formats found');
    }

    return {
      id: album.id,
      title: `${album.name} - ${firstTrack.name}`,
      uploader: album.artist_name,
      uploaderId: album.artist_id,
      thumbnail: album.image,
      duration: firstTrack.duration,
      isLive: false,
      formats,
    };
  }

  /**
   * Get track data from API
   */
  private async getTrackData(trackId: string): Promise<JamendoTrack | null> {
    try {
      const response = await this.client.get(
        `https://api.jamendo.com/v3.0/tracks/?client_id=${this.CLIENT_ID}&id=${trackId}&include=stats&audioformat=mp32`,
        {
          headers: this.getHeaders(),
        }
      ).json<{ results?: JamendoTrack[] }>();

      return response.results?.[0] || null;
    } catch {
      return null;
    }
  }

  /**
   * Get album data from API
   */
  private async getAlbumData(albumId: string): Promise<JamendoAlbum | null> {
    try {
      const response = await this.client.get(
        `https://api.jamendo.com/v3.0/albums/tracks/?client_id=${this.CLIENT_ID}&id=${albumId}&audioformat=mp32`,
        {
          headers: this.getHeaders(),
        }
      ).json<{ results?: JamendoAlbum[] }>();

      return response.results?.[0] || null;
    } catch {
      return null;
    }
  }

  /**
   * Build format list
   */
  private buildFormats(track: JamendoTrack): Format[] {
    const formats: Format[] = [];

    // Streaming URL
    if (track.audio) {
      formats.push({
        url: track.audio,
        formatId: 'mp3-stream',
        ext: 'mp3',
        protocol: 'https',
        acodec: 'mp3',
        formatNote: 'Stream',
      });
    }

    // Download URL (if allowed)
    if (track.audiodownload && track.audiodownload_allowed) {
      formats.push({
        url: track.audiodownload,
        formatId: 'mp3-download',
        ext: 'mp3',
        protocol: 'https',
        acodec: 'mp3',
        formatNote: 'Download',
      });
    }

    // Alternative formats via URL manipulation
    const baseId = track.id;

    // OGG format
    formats.push({
      url: `https://mp3d.jamendo.com/download/track/${baseId}/ogg1`,
      formatId: 'ogg',
      ext: 'ogg',
      protocol: 'https',
      acodec: 'vorbis',
      formatNote: 'OGG',
    });

    // FLAC format (high quality)
    formats.push({
      url: `https://mp3d.jamendo.com/download/track/${baseId}/flac`,
      formatId: 'flac',
      ext: 'flac',
      protocol: 'https',
      acodec: 'flac',
      formatNote: 'FLAC (Lossless)',
    });

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
