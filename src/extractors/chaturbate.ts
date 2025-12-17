/**
 * Chaturbate Extractor
 *
 * Extracts live stream URLs from Chaturbate.com
 *
 * @example
 * ```typescript
 * const extractor = new ChaturbateExtractor(client);
 * const info = await extractor.extract('https://chaturbate.com/username/');
 * console.log(info.formats); // HLS streams
 * ```
 */

import {
  BaseExtractor,
  ExtractorResult,
  ExtractorError,
  UserNotLiveError,
} from './base.js';

const ERROR_MAP: Record<string, string> = {
  offline: 'Room is currently offline',
  private: 'Room is currently in a private show',
  away: 'Performer is currently away',
  'password protected': 'Room is password protected',
  hidden: 'Hidden session in progress',
};

interface ChaturbateApiResponse {
  url?: string;
  room_status?: string;
}

interface RoomDossier {
  hls_source?: string;
  room_status?: string;
  broadcaster_username?: string;
  num_viewers?: number;
  room_title?: string;
}

export class ChaturbateExtractor extends BaseExtractor {
  readonly VALID_URL = /https?:\/\/(?:[^/]+\.)?chaturbate\.(?<tld>com|eu|global)\/(?:fullvideo\/?\?.*?\bb=)?(?<id>[^/?&#]+)/;
  readonly IE_NAME = 'chaturbate';
  readonly AGE_LIMIT = 18;

  async extract(url: string): Promise<ExtractorResult> {
    const match = this.matchUrl(url);
    if (!match?.groups) {
      throw new ExtractorError('Invalid Chaturbate URL');
    }

    const { id: username, tld } = match.groups;

    // Try API first (faster, more reliable)
    const apiResult = await this.extractFromApi(username, tld);
    if (apiResult) return apiResult;

    // Fallback to HTML parsing
    return this.extractFromHtml(username, tld);
  }

  /**
   * Extract stream URL via Chaturbate API
   */
  private async extractFromApi(
    username: string,
    tld: string
  ): Promise<ExtractorResult | null> {
    try {
      const response = await this.postForm<ChaturbateApiResponse>(
        `https://chaturbate.${tld}/get_edge_hls_url_ajax/`,
        { room_slug: username },
        { 'X-Requested-With': 'XMLHttpRequest' }
      );

      if (!response.url) {
        const status = response.room_status;
        if (status && ERROR_MAP[status]) {
          if (status === 'offline') {
            throw new UserNotLiveError(username);
          }
          throw new ExtractorError(ERROR_MAP[status], true);
        }
        // API failed, try HTML fallback
        return null;
      }

      const formats = await this.extractM3U8Formats(response.url, username, {
        live: true,
      });

      return {
        id: username,
        title: username,
        thumbnail: `https://roomimg.stream.highwebmedia.com/ri/${username}.jpg`,
        isLive: true,
        liveStatus: 'is_live',
        ageLimit: this.AGE_LIMIT,
        formats,
      };
    } catch (error) {
      if (error instanceof ExtractorError) throw error;
      // API failed, return null to try HTML fallback
      return null;
    }
  }

  /**
   * Extract stream URL from HTML page
   */
  private async extractFromHtml(
    username: string,
    tld: string
  ): Promise<ExtractorResult> {
    const webpage = await this.downloadWebpage(
      `https://chaturbate.${tld}/${username}/`
    );

    // Check for common errors first
    this.checkForErrors(webpage, username);

    // Try to find initialRoomDossier in JavaScript
    const dossier = this.extractRoomDossier(webpage);

    if (dossier?.hls_source) {
      const formats = await this.extractM3U8Formats(dossier.hls_source, username, {
        live: true,
      });

      return {
        id: username,
        title: dossier.room_title || username,
        thumbnail: `https://roomimg.stream.highwebmedia.com/ri/${username}.jpg`,
        viewCount: dossier.num_viewers,
        isLive: true,
        liveStatus: 'is_live',
        ageLimit: this.AGE_LIMIT,
        formats,
      };
    }

    // Fallback: search for any .m3u8 URL in the page
    const m3u8Urls = this.searchRegexAll(
      /["']([^"']+\.m3u8[^"']*?)["']/g,
      webpage
    );

    for (const m3u8Url of m3u8Urls) {
      try {
        // Skip preview/thumbnail m3u8s
        if (m3u8Url.includes('preview') || m3u8Url.includes('thumb')) continue;

        const formats = await this.extractM3U8Formats(m3u8Url, username, {
          live: true,
        });

        if (formats.length > 0) {
          return {
            id: username,
            title: username,
            thumbnail: `https://roomimg.stream.highwebmedia.com/ri/${username}.jpg`,
            isLive: true,
            liveStatus: 'is_live',
            ageLimit: this.AGE_LIMIT,
            formats,
          };
        }
      } catch {
        // Try next URL
        continue;
      }
    }

    throw new ExtractorError('Could not find stream URL');
  }

  /**
   * Extract room dossier from JavaScript
   */
  private extractRoomDossier(webpage: string): RoomDossier | null {
    // Try to find initialRoomDossier variable
    const dossierMatch = webpage.match(
      /initialRoomDossier\s*=\s*["'](.+?)["']\s*;/
    );

    if (dossierMatch) {
      try {
        // Decode unicode escapes
        const decoded = this.decodeUnicode(dossierMatch[1]);
        return JSON.parse(decoded) as RoomDossier;
      } catch {
        // Failed to parse
      }
    }

    // Try alternative format
    const altMatch = webpage.match(
      /window\.initialRoomDossier\s*=\s*(\{[\s\S]*?\});/
    );

    if (altMatch) {
      try {
        return JSON.parse(altMatch[1]) as RoomDossier;
      } catch {
        // Failed to parse
      }
    }

    return null;
  }

  /**
   * Check for error messages in the page
   */
  private checkForErrors(webpage: string, username: string): void {
    // Check for offline message
    if (
      webpage.includes('offline_tipping') ||
      webpage.includes('tip_offline') ||
      webpage.includes('Room is currently offline')
    ) {
      throw new UserNotLiveError(username);
    }

    // Check for private show
    if (
      webpage.includes('private_show') ||
      webpage.includes('in a private show')
    ) {
      throw new ExtractorError('Room is currently in a private show', true);
    }

    // Check for password protected
    if (webpage.includes('password protected')) {
      throw new ExtractorError('Room is password protected', true);
    }

    // Check for geo-restriction
    if (webpage.includes('geo_blocked') || webpage.includes('not available in your region')) {
      throw new ExtractorError('Content not available in your region', true);
    }
  }
}
