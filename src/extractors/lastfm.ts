/**
 * Last.fm Extractor
 *
 * Extracts audio preview information from Last.fm.
 * Music discovery and scrobbling platform.
 *
 * @example
 * ```typescript
 * const extractor = new LastFmExtractor(client);
 * const info = await extractor.extract('https://www.last.fm/music/Artist/_/Track');
 * ```
 */

import {
  BaseExtractor,
  ExtractorResult,
  ExtractorError,
  Format,
} from './base.js';

interface LastFmTrack {
  name: string;
  url: string;
  duration?: string;
  listeners?: string;
  playcount?: string;
  artist: {
    name: string;
    url: string;
    mbid?: string;
  };
  album?: {
    title: string;
    url: string;
    image?: Array<{ '#text': string; size: string }>;
  };
  toptags?: {
    tag: Array<{ name: string; url: string }>;
  };
  wiki?: {
    published: string;
    summary: string;
    content: string;
  };
  streamable?: {
    '#text': string;
    fulltrack: string;
  };
}

export class LastFmExtractor extends BaseExtractor {
  readonly VALID_URL = [
    // Track URLs
    /https?:\/\/(?:www\.)?last\.fm\/music\/(?<artist>[^\/]+)\/_\/(?<track>[^\/\?]+)/,
    // Track with album
    /https?:\/\/(?:www\.)?last\.fm\/music\/(?<album_artist>[^\/]+)\/(?<album>[^\/]+)\/(?<album_track>[^\/\?]+)/,
  ];
  readonly IE_NAME = 'lastfm';
  readonly AGE_LIMIT = 0;

  // Public Last.fm API key
  private readonly API_KEY = '57ee3318536b23ee81d6b27e36997cde';

  async extract(url: string): Promise<ExtractorResult> {
    const { artist, track } = this.extractInfo(url);

    if (!artist || !track) {
      throw new ExtractorError('Could not extract artist/track from URL');
    }

    // Decode URL-encoded names
    const decodedArtist = decodeURIComponent(artist.replace(/\+/g, ' '));
    const decodedTrack = decodeURIComponent(track.replace(/\+/g, ' '));

    // Get track info
    const trackInfo = await this.getTrackInfo(decodedArtist, decodedTrack);

    if (!trackInfo) {
      throw new ExtractorError('Could not fetch track info');
    }

    const formats = await this.buildFormats(trackInfo, decodedArtist, decodedTrack);

    // Last.fm primarily provides metadata, not streaming
    // We try to find YouTube or other sources
    if (formats.length === 0) {
      throw new ExtractorError('No playable formats found. Last.fm primarily provides metadata.');
    }

    const thumbnail = this.extractThumbnail(trackInfo);

    return {
      id: `${artist}_${track}`,
      title: `${trackInfo.artist.name} - ${trackInfo.name}`,
      description: trackInfo.wiki?.summary?.replace(/<[^>]+>/g, ''),
      uploader: trackInfo.artist.name,
      thumbnail,
      duration: trackInfo.duration ? parseInt(trackInfo.duration, 10) / 1000 : undefined,
      viewCount: trackInfo.playcount ? parseInt(trackInfo.playcount, 10) : undefined,
      isLive: false,
      formats,
    };
  }

  /**
   * Extract artist and track from URL
   */
  private extractInfo(url: string): { artist?: string; track?: string } {
    // Track URL format: /music/Artist/_/Track
    let match = url.match(/\/music\/([^\/]+)\/_\/([^\/\?]+)/);
    if (match) {
      return { artist: match[1], track: match[2] };
    }

    // Album track format: /music/Artist/Album/Track
    match = url.match(/\/music\/([^\/]+)\/[^\/]+\/([^\/\?]+)/);
    if (match) {
      return { artist: match[1], track: match[2] };
    }

    return {};
  }

  /**
   * Get track info from API
   */
  private async getTrackInfo(artist: string, track: string): Promise<LastFmTrack | null> {
    try {
      const params = new URLSearchParams({
        method: 'track.getInfo',
        api_key: this.API_KEY,
        artist,
        track,
        format: 'json',
        autocorrect: '1',
      });

      const response = await this.client.get(
        `https://ws.audioscrobbler.com/2.0/?${params}`,
        {
          headers: this.getHeaders(),
        }
      ).json<{ track?: LastFmTrack; error?: number; message?: string }>();

      if (response.error) {
        return null;
      }

      return response.track || null;
    } catch {
      return null;
    }
  }

  /**
   * Build format list
   */
  private async buildFormats(trackInfo: LastFmTrack, artist: string, track: string): Promise<Format[]> {
    const formats: Format[] = [];

    // Check if track is streamable via Last.fm (rare)
    if (trackInfo.streamable?.fulltrack === '1') {
      // Last.fm no longer provides direct streaming, but we can note it
      // The actual stream would need partner integration
    }

    // Try to find preview from various sources
    // Spotify preview (if available via MusicBrainz)
    const spotifyPreview = await this.findSpotifyPreview(artist, track);
    if (spotifyPreview) {
      formats.push({
        url: spotifyPreview,
        formatId: 'spotify-preview',
        ext: 'mp3',
        protocol: 'https',
        acodec: 'mp3',
        formatNote: 'Spotify Preview (30s)',
      });
    }

    // Deezer preview
    const deezerPreview = await this.findDeezerPreview(artist, track);
    if (deezerPreview) {
      formats.push({
        url: deezerPreview,
        formatId: 'deezer-preview',
        ext: 'mp3',
        protocol: 'https',
        acodec: 'mp3',
        formatNote: 'Deezer Preview (30s)',
      });
    }

    return formats;
  }

  /**
   * Try to find Spotify preview URL
   */
  private async findSpotifyPreview(artist: string, track: string): Promise<string | null> {
    try {
      // Use Spotify's embed API (no auth needed for search)
      const query = encodeURIComponent(`${artist} ${track}`);
      const response = await this.client.get(
        `https://api.spotify.com/v1/search?q=${query}&type=track&limit=1`,
        {
          headers: {
            ...this.getHeaders(),
            // Note: This would need a valid token for production
            // 'Authorization': 'Bearer ...',
          },
        }
      ).json<{ tracks?: { items?: Array<{ preview_url?: string }> } }>();

      return response.tracks?.items?.[0]?.preview_url || null;
    } catch {
      return null;
    }
  }

  /**
   * Try to find Deezer preview URL
   */
  private async findDeezerPreview(artist: string, track: string): Promise<string | null> {
    try {
      const query = encodeURIComponent(`${artist} ${track}`);
      const response = await this.client.get(
        `https://api.deezer.com/search?q=${query}&limit=1`,
        {
          headers: this.getHeaders(),
        }
      ).json<{ data?: Array<{ preview?: string }> }>();

      return response.data?.[0]?.preview || null;
    } catch {
      return null;
    }
  }

  /**
   * Extract thumbnail from track info
   */
  private extractThumbnail(trackInfo: LastFmTrack): string | undefined {
    if (trackInfo.album?.image) {
      // Get largest image
      const images = trackInfo.album.image;
      for (const size of ['extralarge', 'large', 'medium', 'small']) {
        const img = images.find(i => i.size === size);
        if (img?.['#text']) {
          return img['#text'];
        }
      }
    }
    return undefined;
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
