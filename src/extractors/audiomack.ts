/**
 * Audiomack Extractor
 *
 * Extracts audio information from Audiomack.
 * Music streaming platform for independent artists.
 *
 * @example
 * ```typescript
 * const extractor = new AudiomackExtractor(client);
 * const info = await extractor.extract('https://audiomack.com/artist/song');
 * ```
 */

import {
  BaseExtractor,
  ExtractorResult,
  ExtractorError,
  Format,
} from './base.js';

interface AudiomackSong {
  id: number;
  url_slug: string;
  title: string;
  description?: string;
  artist: string;
  uploader: {
    id: string;
    url_slug: string;
    name: string;
    image?: string;
  };
  image?: string;
  image_base?: string;
  duration: number;
  streaming_url?: string;
  download_url?: string;
  play_count?: number;
  favorite_count?: number;
  comment_count?: number;
  repost_count?: number;
  released?: string;
  genre?: string;
}

interface AudiomackAlbum {
  id: number;
  url_slug: string;
  title: string;
  artist: string;
  uploader: {
    id: string;
    url_slug: string;
    name: string;
  };
  image?: string;
  tracks: AudiomackSong[];
}

export class AudiomackExtractor extends BaseExtractor {
  readonly VALID_URL = [
    // Song URLs
    /https?:\/\/(?:www\.)?audiomack\.com\/(?<artist>[^\/]+)\/song\/(?<song>[^\/\?]+)/,
    // Album URLs
    /https?:\/\/(?:www\.)?audiomack\.com\/(?<album_artist>[^\/]+)\/album\/(?<album>[^\/\?]+)/,
    // Playlist URLs
    /https?:\/\/(?:www\.)?audiomack\.com\/(?<playlist_artist>[^\/]+)\/playlist\/(?<playlist>[^\/\?]+)/,
  ];
  readonly IE_NAME = 'audiomack';
  readonly AGE_LIMIT = 0;

  async extract(url: string): Promise<ExtractorResult> {
    const { type, artist, slug } = this.extractInfo(url);

    if (!artist || !slug) {
      throw new ExtractorError('Could not extract song/album info from URL');
    }

    if (type === 'album' || type === 'playlist') {
      return this.extractAlbum(artist, slug, type);
    }

    return this.extractSong(artist, slug);
  }

  /**
   * Extract type, artist and slug from URL
   */
  private extractInfo(url: string): { type: string; artist?: string; slug?: string } {
    // Song
    let match = url.match(/audiomack\.com\/([^\/]+)\/song\/([^\/\?]+)/);
    if (match) {
      return { type: 'song', artist: match[1], slug: match[2] };
    }

    // Album
    match = url.match(/audiomack\.com\/([^\/]+)\/album\/([^\/\?]+)/);
    if (match) {
      return { type: 'album', artist: match[1], slug: match[2] };
    }

    // Playlist
    match = url.match(/audiomack\.com\/([^\/]+)\/playlist\/([^\/\?]+)/);
    if (match) {
      return { type: 'playlist', artist: match[1], slug: match[2] };
    }

    return { type: 'unknown' };
  }

  /**
   * Extract single song
   */
  private async extractSong(artist: string, slug: string): Promise<ExtractorResult> {
    const song = await this.getSongData(artist, slug);

    if (!song) {
      throw new ExtractorError('Could not fetch song data');
    }

    const formats = this.buildFormats(song);

    if (formats.length === 0) {
      throw new ExtractorError('No playable formats found');
    }

    return {
      id: String(song.id),
      title: song.title,
      description: song.description,
      uploader: song.uploader?.name || song.artist,
      uploaderId: song.uploader?.url_slug,
      thumbnail: song.image || song.image_base,
      duration: song.duration,
      viewCount: song.play_count,
      likeCount: song.favorite_count,
      commentCount: song.comment_count,
      isLive: false,
      formats,
    };
  }

  /**
   * Extract album (returns first track)
   */
  private async extractAlbum(artist: string, slug: string, type: string): Promise<ExtractorResult> {
    const album = await this.getAlbumData(artist, slug, type);

    if (!album || album.tracks.length === 0) {
      throw new ExtractorError(`Could not fetch ${type} data`);
    }

    // Use first track
    const firstTrack = album.tracks[0];
    const formats = this.buildFormats(firstTrack);

    if (formats.length === 0) {
      throw new ExtractorError('No playable formats found');
    }

    return {
      id: String(album.id),
      title: `${album.title} - ${firstTrack.title}`,
      uploader: album.uploader?.name || album.artist,
      uploaderId: album.uploader?.url_slug,
      thumbnail: album.image,
      duration: firstTrack.duration,
      isLive: false,
      formats,
    };
  }

  /**
   * Get song data from API
   */
  private async getSongData(artist: string, slug: string): Promise<AudiomackSong | null> {
    try {
      const response = await this.client.get(
        `https://api.audiomack.com/v1/music/song/${artist}/${slug}`,
        {
          headers: this.getHeaders(),
        }
      ).json<{ results?: AudiomackSong }>();

      return response.results || null;
    } catch {
      return null;
    }
  }

  /**
   * Get album/playlist data from API
   */
  private async getAlbumData(artist: string, slug: string, type: string): Promise<AudiomackAlbum | null> {
    try {
      const response = await this.client.get(
        `https://api.audiomack.com/v1/music/${type}/${artist}/${slug}`,
        {
          headers: this.getHeaders(),
        }
      ).json<{ results?: AudiomackAlbum }>();

      return response.results || null;
    } catch {
      return null;
    }
  }

  /**
   * Build format list
   */
  private buildFormats(song: AudiomackSong): Format[] {
    const formats: Format[] = [];

    // Streaming URL (usually MP3)
    if (song.streaming_url) {
      formats.push({
        url: song.streaming_url,
        formatId: 'stream',
        ext: 'mp3',
        protocol: 'https',
        acodec: 'mp3',
      });
    }

    // Download URL (usually higher quality)
    if (song.download_url && song.download_url !== song.streaming_url) {
      formats.push({
        url: song.download_url,
        formatId: 'download',
        ext: 'mp3',
        protocol: 'https',
        acodec: 'mp3',
        formatNote: 'Download',
      });
    }

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
