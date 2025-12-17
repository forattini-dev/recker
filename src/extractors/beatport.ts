/**
 * Beatport Extractor
 *
 * Extracts audio preview information from Beatport.
 * Electronic music store and streaming platform.
 *
 * @example
 * ```typescript
 * const extractor = new BeatportExtractor(client);
 * const info = await extractor.extract('https://www.beatport.com/track/song-name/123456');
 * ```
 */

import {
  BaseExtractor,
  ExtractorResult,
  ExtractorError,
  Format,
} from './base.js';

interface BeatportTrack {
  id: number;
  name: string;
  slug: string;
  mix_name?: string;
  release?: {
    id: number;
    name: string;
    slug: string;
    image?: {
      uri: string;
    };
  };
  artists?: Array<{
    id: number;
    name: string;
    slug: string;
  }>;
  genres?: Array<{
    id: number;
    name: string;
    slug: string;
  }>;
  bpm?: number;
  key?: {
    name: string;
  };
  length_ms?: number;
  publish_date?: string;
  sample_url?: string;
  preview?: {
    mp3?: {
      url: string;
    };
    mp4?: {
      url: string;
    };
  };
  waveform?: {
    large?: {
      url: string;
    };
  };
}

export class BeatportExtractor extends BaseExtractor {
  readonly VALID_URL = [
    // Track URLs
    /https?:\/\/(?:www\.)?beatport\.com\/track\/(?<slug>[^\/]+)\/(?<id>\d+)/,
    // Release URLs
    /https?:\/\/(?:www\.)?beatport\.com\/release\/(?<release_slug>[^\/]+)\/(?<release_id>\d+)/,
  ];
  readonly IE_NAME = 'beatport';
  readonly AGE_LIMIT = 0;

  async extract(url: string): Promise<ExtractorResult> {
    const { type, id } = this.extractInfo(url);

    if (!id) {
      throw new ExtractorError('Could not extract track/release ID from URL');
    }

    if (type === 'release') {
      return this.extractRelease(id);
    }

    return this.extractTrack(id);
  }

  /**
   * Extract type and ID from URL
   */
  private extractInfo(url: string): { type: string; id?: string } {
    // Track
    let match = url.match(/\/track\/[^\/]+\/(\d+)/);
    if (match) {
      return { type: 'track', id: match[1] };
    }

    // Release
    match = url.match(/\/release\/[^\/]+\/(\d+)/);
    if (match) {
      return { type: 'release', id: match[1] };
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
      throw new ExtractorError('No preview available for this track');
    }

    const artistNames = track.artists?.map(a => a.name).join(', ') || 'Unknown Artist';
    const fullTitle = track.mix_name
      ? `${track.name} (${track.mix_name})`
      : track.name;

    return {
      id: String(track.id),
      title: `${artistNames} - ${fullTitle}`,
      uploader: artistNames,
      thumbnail: track.release?.image?.uri,
      duration: track.length_ms ? Math.floor(track.length_ms / 1000) : undefined,
      isLive: false,
      formats,
    };
  }

  /**
   * Extract release (returns first track)
   */
  private async extractRelease(releaseId: string): Promise<ExtractorResult> {
    const release = await this.getReleaseData(releaseId);

    if (!release || !release.tracks || release.tracks.length === 0) {
      throw new ExtractorError('Could not fetch release data');
    }

    // Use first track with preview
    const trackWithPreview = release.tracks.find(t => t.sample_url || t.preview?.mp3?.url);
    if (!trackWithPreview) {
      throw new ExtractorError('No tracks with previews found in this release');
    }

    const formats = this.buildFormats(trackWithPreview);

    const artistNames = trackWithPreview.artists?.map(a => a.name).join(', ') || 'Unknown Artist';

    return {
      id: String(release.id),
      title: `${release.name} - ${trackWithPreview.name}`,
      uploader: artistNames,
      thumbnail: release.image?.uri,
      duration: trackWithPreview.length_ms ? Math.floor(trackWithPreview.length_ms / 1000) : undefined,
      isLive: false,
      formats,
    };
  }

  /**
   * Get track data from webpage
   */
  private async getTrackData(trackId: string): Promise<BeatportTrack | null> {
    try {
      // Beatport doesn't have a public API, so we scrape the page
      const html = await this.downloadWebpage(`https://www.beatport.com/track/x/${trackId}`);

      return this.extractTrackFromHtml(html);
    } catch {
      return null;
    }
  }

  /**
   * Get release data from webpage
   */
  private async getReleaseData(releaseId: string): Promise<{ id: number; name: string; image?: { uri: string }; tracks: BeatportTrack[] } | null> {
    try {
      const html = await this.downloadWebpage(`https://www.beatport.com/release/x/${releaseId}`);

      return this.extractReleaseFromHtml(html);
    } catch {
      return null;
    }
  }

  /**
   * Extract track data from HTML
   */
  private extractTrackFromHtml(html: string): BeatportTrack | null {
    // Find Next.js data or JSON-LD
    const nextDataMatch = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/);

    if (nextDataMatch) {
      try {
        const data = JSON.parse(nextDataMatch[1]);
        const track = data?.props?.pageProps?.track ||
                      data?.props?.pageProps?.dehydratedState?.queries?.[0]?.state?.data;

        if (track) {
          return this.normalizeTrack(track);
        }
      } catch {
        // Continue to fallback
      }
    }

    // Fallback: extract from page patterns
    const track: BeatportTrack = {
      id: 0,
      name: '',
      slug: '',
    };

    // Extract ID
    const idMatch = html.match(/\/track\/[^\/]+\/(\d+)/);
    if (idMatch) {
      track.id = parseInt(idMatch[1], 10);
    }

    // Extract title
    const titleMatch = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/) ||
                       html.match(/<h1[^>]*class="[^"]*track-title[^"]*"[^>]*>([^<]+)</);
    if (titleMatch) {
      track.name = titleMatch[1];
    }

    // Extract preview URL
    const previewMatch = html.match(/"sample_url"\s*:\s*"([^"]+)"/) ||
                         html.match(/data-sample-url="([^"]+)"/) ||
                         html.match(/"mp3"\s*:\s*\{\s*"url"\s*:\s*"([^"]+)"/);
    if (previewMatch) {
      track.sample_url = previewMatch[1].replace(/\\\//g, '/');
    }

    // Extract image
    const imageMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/);
    if (imageMatch) {
      track.release = {
        id: 0,
        name: '',
        slug: '',
        image: { uri: imageMatch[1] },
      };
    }

    // Extract artists
    const artistMatch = html.match(/"artists"\s*:\s*\[([^\]]+)\]/);
    if (artistMatch) {
      try {
        track.artists = JSON.parse(`[${artistMatch[1]}]`);
      } catch {
        // Ignore
      }
    }

    return track.id && (track.sample_url || track.name) ? track : null;
  }

  /**
   * Extract release data from HTML
   */
  private extractReleaseFromHtml(html: string): { id: number; name: string; image?: { uri: string }; tracks: BeatportTrack[] } | null {
    const nextDataMatch = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/);

    if (nextDataMatch) {
      try {
        const data = JSON.parse(nextDataMatch[1]);
        const release = data?.props?.pageProps?.release ||
                        data?.props?.pageProps?.dehydratedState?.queries?.[0]?.state?.data;

        if (release) {
          return {
            id: release.id,
            name: release.name,
            image: release.image,
            tracks: (release.tracks || []).map((t: any) => this.normalizeTrack(t)),
          };
        }
      } catch {
        // Ignore
      }
    }

    return null;
  }

  /**
   * Normalize track data from various formats
   */
  private normalizeTrack(rawTrack: any): BeatportTrack {
    return {
      id: rawTrack.id,
      name: rawTrack.name,
      slug: rawTrack.slug || '',
      mix_name: rawTrack.mix_name || rawTrack.mixName,
      release: rawTrack.release,
      artists: rawTrack.artists,
      genres: rawTrack.genres,
      bpm: rawTrack.bpm,
      key: rawTrack.key,
      length_ms: rawTrack.length_ms || rawTrack.lengthMs,
      publish_date: rawTrack.publish_date || rawTrack.publishDate,
      sample_url: rawTrack.sample_url || rawTrack.sampleUrl,
      preview: rawTrack.preview,
      waveform: rawTrack.waveform,
    };
  }

  /**
   * Build format list
   */
  private buildFormats(track: BeatportTrack): Format[] {
    const formats: Format[] = [];

    // Sample URL (usually 128kbps MP3 preview)
    if (track.sample_url) {
      formats.push({
        url: track.sample_url,
        formatId: 'mp3-preview',
        ext: 'mp3',
        protocol: 'https',
        acodec: 'mp3',
        bandwidth: 128000,
        formatNote: 'Preview (2 min)',
      });
    }

    // MP3 preview
    if (track.preview?.mp3?.url) {
      const url = track.preview.mp3.url;
      if (!formats.some(f => f.url === url)) {
        formats.push({
          url,
          formatId: 'mp3-preview-alt',
          ext: 'mp3',
          protocol: 'https',
          acodec: 'mp3',
          formatNote: 'Preview MP3',
        });
      }
    }

    // MP4/AAC preview
    if (track.preview?.mp4?.url) {
      formats.push({
        url: track.preview.mp4.url,
        formatId: 'aac-preview',
        ext: 'm4a',
        protocol: 'https',
        acodec: 'aac',
        formatNote: 'Preview AAC',
      });
    }

    return formats;
  }

  /**
   * Get request headers
   */
  private getHeaders(): Record<string, string> {
    return {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };
  }
}
