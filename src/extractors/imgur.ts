/**
 * Imgur Extractor
 *
 * Extracts video/gif information from Imgur.
 * Supports images, videos, albums, and galleries.
 *
 * @example
 * ```typescript
 * const extractor = new ImgurExtractor(client);
 * const info = await extractor.extract('https://imgur.com/a/AbCdEf');
 * ```
 */

import {
  BaseExtractor,
  ExtractorResult,
  ExtractorError,
  Format,
} from './base.js';

interface ImgurMedia {
  id: string;
  title?: string;
  description?: string;
  type: string;
  width: number;
  height: number;
  size: number;
  ext: string;
  has_sound: boolean;
  url: string;
  mp4?: string;
  gifv?: string;
  hls?: string;
}

interface ImgurPost {
  id: string;
  title?: string;
  description?: string;
  account_url?: string;
  datetime: number;
  views?: number;
  ups?: number;
  downs?: number;
  points?: number;
  is_album: boolean;
  media: ImgurMedia[];
}

export class ImgurExtractor extends BaseExtractor {
  readonly VALID_URL = [
    // Direct media URLs
    /https?:\/\/(?:i\.)?imgur\.com\/(?<id>[a-zA-Z0-9]+)\.(?:gifv|mp4|gif)/,
    // Album URLs
    /https?:\/\/(?:www\.)?imgur\.com\/a\/(?<album_id>[a-zA-Z0-9]+)/,
    // Gallery URLs
    /https?:\/\/(?:www\.)?imgur\.com\/gallery\/(?<gallery_id>[a-zA-Z0-9]+)/,
    // Single post URLs
    /https?:\/\/(?:www\.)?imgur\.com\/(?<post_id>[a-zA-Z0-9]{5,})/,
  ];
  readonly IE_NAME = 'imgur';
  readonly AGE_LIMIT = 0;

  private clientId = '546c25a59c58ad7';

  async extract(url: string): Promise<ExtractorResult> {
    // Determine URL type
    const albumMatch = url.match(/imgur\.com\/a\/([a-zA-Z0-9]+)/);
    const galleryMatch = url.match(/imgur\.com\/gallery\/([a-zA-Z0-9]+)/);
    const directMatch = url.match(/imgur\.com\/([a-zA-Z0-9]+)\.(gifv|mp4|gif)/);
    const postMatch = url.match(/imgur\.com\/([a-zA-Z0-9]{5,})(?:$|\?)/);

    let mediaId: string;
    let isAlbum = false;

    if (albumMatch) {
      mediaId = albumMatch[1];
      isAlbum = true;
    } else if (galleryMatch) {
      mediaId = galleryMatch[1];
      isAlbum = true;
    } else if (directMatch) {
      mediaId = directMatch[1];
    } else if (postMatch) {
      mediaId = postMatch[1];
    } else {
      throw new ExtractorError('Could not extract media ID from URL');
    }

    // Fetch media info
    const post = isAlbum
      ? await this.getAlbumInfo(mediaId)
      : await this.getPostInfo(mediaId);

    if (!post || post.media.length === 0) {
      throw new ExtractorError('Could not fetch media data');
    }

    // Get first video/gif
    const videoMedia = post.media.find(m =>
      m.type === 'video/mp4' ||
      m.ext === '.mp4' ||
      m.ext === '.gifv' ||
      m.mp4
    );

    if (!videoMedia) {
      throw new ExtractorError('No video found in this post');
    }

    const formats = this.buildFormats(videoMedia);

    if (formats.length === 0) {
      throw new ExtractorError('No playable formats found');
    }

    return {
      id: mediaId,
      title: post.title || `Imgur ${mediaId}`,
      description: post.description,
      uploader: post.account_url,
      viewCount: post.views,
      isLive: false,
      formats,
    };
  }

  /**
   * Get album info from API
   */
  private async getAlbumInfo(albumId: string): Promise<ImgurPost | null> {
    try {
      const response = await this.client.get(
        `https://api.imgur.com/3/album/${albumId}`,
        {
          headers: this.getHeaders(),
        }
      ).json<{ data: any; success: boolean }>();

      if (!response.success) return null;

      const album = response.data;
      return {
        id: album.id,
        title: album.title,
        description: album.description,
        account_url: album.account_url,
        datetime: album.datetime,
        views: album.views,
        is_album: true,
        media: (album.images || []).map((img: any) => this.normalizeMedia(img)),
      };
    } catch {
      // Try webpage extraction
      return this.extractFromWebpage(`https://imgur.com/a/${albumId}`);
    }
  }

  /**
   * Get post info from API
   */
  private async getPostInfo(postId: string): Promise<ImgurPost | null> {
    try {
      const response = await this.client.get(
        `https://api.imgur.com/3/image/${postId}`,
        {
          headers: this.getHeaders(),
        }
      ).json<{ data: any; success: boolean }>();

      if (!response.success) return null;

      const image = response.data;
      return {
        id: image.id,
        title: image.title,
        description: image.description,
        account_url: image.account_url,
        datetime: image.datetime,
        views: image.views,
        is_album: false,
        media: [this.normalizeMedia(image)],
      };
    } catch {
      // Try webpage extraction
      return this.extractFromWebpage(`https://imgur.com/${postId}`);
    }
  }

  /**
   * Extract from webpage
   */
  private async extractFromWebpage(url: string): Promise<ImgurPost | null> {
    try {
      const html = await this.downloadWebpage(url);

      // Find image data in page
      const dataMatch = html.match(/window\.postDataJSON\s*=\s*"([^"]+)"/);
      if (dataMatch) {
        const decoded = dataMatch[1]
          .replace(/\\u([0-9a-f]{4})/gi, (_, hex) =>
            String.fromCharCode(parseInt(hex, 16))
          )
          .replace(/\\"/g, '"');

        const data = JSON.parse(decoded);
        return {
          id: data.id,
          title: data.title,
          description: data.description,
          account_url: data.account?.username,
          datetime: data.created_at,
          views: data.view_count,
          is_album: data.is_album,
          media: (data.media || [data]).map((m: any) => this.normalizeMedia(m)),
        };
      }

      // Fallback: find mp4 URL in page
      const mp4Match = html.match(/content="(https:\/\/i\.imgur\.com\/[a-zA-Z0-9]+\.mp4)"/);
      if (mp4Match) {
        const id = mp4Match[1].match(/\/([a-zA-Z0-9]+)\.mp4/)?.[1] || 'unknown';
        return {
          id,
          title: undefined,
          datetime: Date.now(),
          is_album: false,
          media: [{
            id,
            type: 'video/mp4',
            width: 0,
            height: 0,
            size: 0,
            ext: '.mp4',
            has_sound: false,
            url: mp4Match[1],
            mp4: mp4Match[1],
          }],
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Normalize media object
   */
  private normalizeMedia(item: any): ImgurMedia {
    return {
      id: item.id || item.hash,
      title: item.title,
      description: item.description,
      type: item.type || item.mime_type || 'image',
      width: item.width,
      height: item.height,
      size: item.size,
      ext: item.ext || `.${item.type?.split('/')[1] || 'jpg'}`,
      has_sound: item.has_sound || false,
      url: item.url || item.link || `https://i.imgur.com/${item.id || item.hash}${item.ext || '.jpg'}`,
      mp4: item.mp4,
      gifv: item.gifv,
      hls: item.hls,
    };
  }

  /**
   * Build format list
   */
  private buildFormats(media: ImgurMedia): Format[] {
    const formats: Format[] = [];

    // MP4 version
    if (media.mp4) {
      formats.push({
        url: media.mp4,
        formatId: 'mp4',
        ext: 'mp4',
        protocol: 'https',
        width: media.width,
        height: media.height,
      });
    } else if (media.url.endsWith('.mp4') || media.type === 'video/mp4') {
      formats.push({
        url: media.url,
        formatId: 'mp4',
        ext: 'mp4',
        protocol: 'https',
        width: media.width,
        height: media.height,
      });
    }

    // GIFV version (actually MP4)
    if (media.gifv && !media.mp4) {
      formats.push({
        url: media.gifv.replace('.gifv', '.mp4'),
        formatId: 'gifv',
        ext: 'mp4',
        protocol: 'https',
        width: media.width,
        height: media.height,
      });
    }

    // HLS version
    if (media.hls) {
      formats.push({
        url: media.hls,
        formatId: 'hls',
        ext: 'm3u8',
        protocol: 'm3u8',
        width: media.width,
        height: media.height,
      });
    }

    // Generate MP4 URL from ID if nothing found
    if (formats.length === 0 && media.id) {
      formats.push({
        url: `https://i.imgur.com/${media.id}.mp4`,
        formatId: 'mp4-fallback',
        ext: 'mp4',
        protocol: 'https',
      });
    }

    return formats;
  }

  /**
   * Get request headers
   */
  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `Client-ID ${this.clientId}`,
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    };
  }
}
