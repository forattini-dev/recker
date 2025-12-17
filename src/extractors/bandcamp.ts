/**
 * Bandcamp Extractor
 *
 * Extracts audio information from Bandcamp.
 * Independent music platform.
 *
 * @example
 * ```typescript
 * const extractor = new BandcampExtractor(client);
 * const info = await extractor.extract('https://artist.bandcamp.com/track/song');
 * ```
 */

import {
  BaseExtractor,
  ExtractorResult,
  ExtractorError,
  Format,
} from './base.js';

interface BandcampTrack {
  id: number;
  title: string;
  artist?: string;
  album_title?: string;
  duration: number;
  track_num?: number;
  streaming_url?: {
    'mp3-128'?: string;
  };
  file?: {
    'mp3-128'?: string;
  };
  art_id?: number;
}

interface BandcampAlbum {
  id: number;
  title: string;
  artist: string;
  current: {
    title: string;
    release_date?: string;
  };
  art_id?: number;
  trackinfo: BandcampTrack[];
  url: string;
}

export class BandcampExtractor extends BaseExtractor {
  readonly VALID_URL = [
    // Track URLs
    /https?:\/\/(?<subdomain>[^\.]+)\.bandcamp\.com\/track\/(?<track>[^\/\?]+)/,
    // Album URLs
    /https?:\/\/(?<album_subdomain>[^\.]+)\.bandcamp\.com\/album\/(?<album>[^\/\?]+)/,
    // Custom domain tracks
    /https?:\/\/(?<custom_domain>[^\/]+)\/track\/(?<custom_track>[^\/\?]+)/,
    // Custom domain albums
    /https?:\/\/(?<custom_album_domain>[^\/]+)\/album\/(?<custom_album>[^\/\?]+)/,
  ];
  readonly IE_NAME = 'bandcamp';
  readonly AGE_LIMIT = 0;

  async extract(url: string): Promise<ExtractorResult> {
    // Check if it's an album
    const isAlbum = url.includes('/album/');

    if (isAlbum) {
      return this.extractAlbum(url);
    }

    return this.extractTrack(url);
  }

  /**
   * Extract single track
   */
  private async extractTrack(url: string): Promise<ExtractorResult> {
    const html = await this.downloadWebpage(url);

    // Extract track data from page
    const trackData = this.extractTrackData(html);

    if (!trackData) {
      throw new ExtractorError('Could not extract track data');
    }

    const formats = this.buildFormats(trackData);

    if (formats.length === 0) {
      throw new ExtractorError('No playable formats found');
    }

    return {
      id: String(trackData.id),
      title: trackData.title,
      description: trackData.album_title ? `From album: ${trackData.album_title}` : undefined,
      uploader: trackData.artist,
      thumbnail: trackData.art_id ? `https://f4.bcbits.com/img/a${trackData.art_id}_10.jpg` : undefined,
      duration: trackData.duration,
      isLive: false,
      formats,
    };
  }

  /**
   * Extract album (returns first track with album info)
   */
  private async extractAlbum(url: string): Promise<ExtractorResult> {
    const html = await this.downloadWebpage(url);

    // Extract album data from page
    const albumData = this.extractAlbumData(html);

    if (!albumData || albumData.trackinfo.length === 0) {
      throw new ExtractorError('Could not extract album data');
    }

    // Get first playable track
    const firstTrack = albumData.trackinfo.find(t =>
      t.streaming_url?.['mp3-128'] || t.file?.['mp3-128']
    );

    if (!firstTrack) {
      throw new ExtractorError('No playable tracks in album');
    }

    const formats = this.buildFormats(firstTrack);

    return {
      id: String(albumData.id),
      title: `${albumData.artist} - ${albumData.current.title}`,
      uploader: albumData.artist,
      thumbnail: albumData.art_id ? `https://f4.bcbits.com/img/a${albumData.art_id}_10.jpg` : undefined,
      isLive: false,
      formats,
    };
  }

  /**
   * Extract track data from HTML
   */
  private extractTrackData(html: string): BandcampTrack | null {
    // Find TralbumData in page
    const dataMatch = html.match(/var\s+TralbumData\s*=\s*(\{.+?\});/s);
    if (!dataMatch) return null;

    try {
      // Clean up the JSON (remove trailing commas, etc.)
      let jsonStr = dataMatch[1]
        .replace(/,(\s*[}\]])/g, '$1')
        .replace(/'/g, '"');

      // Try to extract just what we need
      const trackInfoMatch = jsonStr.match(/"trackinfo"\s*:\s*(\[.+?\])/s);
      const currentMatch = jsonStr.match(/"current"\s*:\s*(\{.+?\})/s);
      const artistMatch = html.match(/data-band="([^"]+)"/) ||
                          html.match(/<span[^>]*itemprop="byArtist"[^>]*>([^<]+)</) ||
                          jsonStr.match(/"artist"\s*:\s*"([^"]+)"/);

      if (!trackInfoMatch) return null;

      const trackInfo = JSON.parse(trackInfoMatch[1]);
      const current = currentMatch ? JSON.parse(currentMatch[1]) : {};

      const track = trackInfo[0];
      if (!track) return null;

      // Extract art_id
      const artMatch = html.match(/art_id\s*:\s*(\d+)/) ||
                       html.match(/<a[^>]+class="popupImage"[^>]+href="[^"]*a(\d+)_/);
      const artId = artMatch ? parseInt(artMatch[1], 10) : undefined;

      return {
        id: track.id || current.id,
        title: track.title,
        artist: artistMatch?.[1],
        album_title: current.title,
        duration: track.duration,
        track_num: track.track_num,
        streaming_url: track.streaming_url || { 'mp3-128': track.file?.['mp3-128'] },
        file: track.file,
        art_id: artId,
      };
    } catch {
      return null;
    }
  }

  /**
   * Extract album data from HTML
   */
  private extractAlbumData(html: string): BandcampAlbum | null {
    // Find TralbumData in page
    const dataMatch = html.match(/var\s+TralbumData\s*=\s*(\{.+?\});/s);
    if (!dataMatch) return null;

    try {
      // Extract trackinfo
      const trackInfoMatch = dataMatch[1].match(/"trackinfo"\s*:\s*(\[.+?\])\s*,\s*"/s);
      const currentMatch = dataMatch[1].match(/"current"\s*:\s*(\{[^}]+\})/);
      const artistMatch = html.match(/data-band="([^"]+)"/) ||
                          dataMatch[1].match(/"artist"\s*:\s*"([^"]+)"/);

      if (!trackInfoMatch) return null;

      const trackInfo = JSON.parse(trackInfoMatch[1]);
      const current = currentMatch ? JSON.parse(currentMatch[1].replace(/,\s*}/, '}')) : {};

      // Extract art_id
      const artMatch = html.match(/art_id\s*:\s*(\d+)/);
      const artId = artMatch ? parseInt(artMatch[1], 10) : undefined;

      // Extract album ID
      const albumIdMatch = html.match(/album_id['"]\s*:\s*(\d+)/) ||
                           dataMatch[1].match(/"id"\s*:\s*(\d+)/);

      return {
        id: albumIdMatch ? parseInt(albumIdMatch[1], 10) : 0,
        title: current.title || 'Unknown Album',
        artist: artistMatch?.[1] || 'Unknown Artist',
        current: {
          title: current.title || 'Unknown Album',
          release_date: current.release_date,
        },
        art_id: artId,
        trackinfo: trackInfo,
        url: dataMatch[1].match(/"url"\s*:\s*"([^"]+)"/)?.[1] || '',
      };
    } catch {
      return null;
    }
  }

  /**
   * Build format list
   */
  private buildFormats(track: BandcampTrack): Format[] {
    const formats: Format[] = [];

    // MP3 128kbps
    const mp3Url = track.streaming_url?.['mp3-128'] || track.file?.['mp3-128'];
    if (mp3Url) {
      formats.push({
        url: mp3Url,
        formatId: 'mp3-128',
        ext: 'mp3',
        protocol: 'https',
        acodec: 'mp3',
        bandwidth: 128000,
      });
    }

    return formats;
  }
}
