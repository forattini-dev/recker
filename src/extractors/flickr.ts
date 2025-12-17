/**
 * Flickr Extractor
 *
 * Extracts video information from Flickr.
 * Photo and video hosting platform.
 *
 * @example
 * ```typescript
 * const extractor = new FlickrExtractor(client);
 * const info = await extractor.extract('https://www.flickr.com/photos/user/123456789/');
 * ```
 */

import {
  BaseExtractor,
  ExtractorResult,
  ExtractorError,
  Format,
} from './base.js';

interface FlickrPhoto {
  id: string;
  secret: string;
  server: string;
  farm: number;
  owner: {
    nsid: string;
    username: string;
    realname: string;
    path_alias: string;
  };
  title: { _content: string };
  description: { _content: string };
  dates: {
    posted: string;
    taken: string;
  };
  views: string;
  comments: { _content: string };
  media: string;
  duration?: number;
}

interface FlickrVideoSizes {
  sizes: {
    size: Array<{
      label: string;
      width: number;
      height: number;
      source: string;
      url: string;
      media: string;
    }>;
  };
}

export class FlickrExtractor extends BaseExtractor {
  readonly VALID_URL = [
    // Photo/video URLs
    /https?:\/\/(?:www\.)?flickr\.com\/photos\/(?<user>[^\/]+)\/(?<id>\d+)/,
    // Short URLs
    /https?:\/\/flic\.kr\/p\/(?<short_id>[a-zA-Z0-9]+)/,
    // Album video
    /https?:\/\/(?:www\.)?flickr\.com\/photos\/(?<album_user>[^\/]+)\/albums\/(?<album_id>\d+)/,
  ];
  readonly IE_NAME = 'flickr';
  readonly AGE_LIMIT = 0;

  // Public API key (used by Flickr's own embeds)
  private readonly API_KEY = '6f93d9bd5fef5831ec592f0b527fdeff';

  async extract(url: string): Promise<ExtractorResult> {
    // Handle short URLs
    if (url.includes('flic.kr')) {
      url = await this.resolveShortUrl(url);
    }

    const photoId = this.extractPhotoId(url);

    if (!photoId) {
      throw new ExtractorError('Could not extract photo/video ID from URL');
    }

    // Get photo info
    const photo = await this.getPhotoInfo(photoId);

    if (!photo) {
      throw new ExtractorError('Could not fetch photo/video info');
    }

    if (photo.media !== 'video') {
      throw new ExtractorError('This is not a video');
    }

    // Get video sizes/formats
    const formats = await this.getVideoFormats(photoId);

    if (formats.length === 0) {
      throw new ExtractorError('No playable formats found');
    }

    const thumbnail = this.buildThumbnailUrl(photo);

    return {
      id: photoId,
      title: photo.title._content || `Flickr Video ${photoId}`,
      description: photo.description._content,
      uploader: photo.owner.realname || photo.owner.username,
      uploaderId: photo.owner.nsid,
      thumbnail,
      duration: photo.duration,
      viewCount: parseInt(photo.views, 10) || undefined,
      commentCount: parseInt(photo.comments._content, 10) || undefined,
      isLive: false,
      formats,
    };
  }

  /**
   * Extract photo ID from URL
   */
  private extractPhotoId(url: string): string | null {
    // Standard format
    const match = url.match(/\/photos\/[^\/]+\/(\d+)/);
    if (match) return match[1];

    return null;
  }

  /**
   * Resolve short URL
   */
  private async resolveShortUrl(url: string): Promise<string> {
    try {
      // Client follows redirects automatically
      const response = await this.client.get(url, {
        headers: this.getHeaders(),
      });
      return response.url || url;
    } catch {
      return url;
    }
  }

  /**
   * Get photo info from API
   */
  private async getPhotoInfo(photoId: string): Promise<FlickrPhoto | null> {
    try {
      const apiUrl = `https://api.flickr.com/services/rest/?method=flickr.photos.getInfo&api_key=${this.API_KEY}&photo_id=${photoId}&format=json&nojsoncallback=1`;

      const response = await this.client.get(apiUrl, {
        headers: this.getHeaders(),
      }).json<{ stat: string; photo?: FlickrPhoto }>();

      if (response.stat === 'ok' && response.photo) {
        return response.photo;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get video formats/sizes
   */
  private async getVideoFormats(photoId: string): Promise<Format[]> {
    try {
      const apiUrl = `https://api.flickr.com/services/rest/?method=flickr.video.getStreamInfo&api_key=${this.API_KEY}&photo_id=${photoId}&format=json&nojsoncallback=1`;

      const response = await this.client.get(apiUrl, {
        headers: this.getHeaders(),
      }).json<{ stat: string; streams?: { stream: Array<{ type: string; _content: string }> } }>();

      const formats: Format[] = [];

      if (response.stat === 'ok' && response.streams?.stream) {
        for (const stream of response.streams.stream) {
          if (stream._content) {
            const isHls = stream.type === 'hls';

            formats.push({
              url: stream._content,
              formatId: stream.type,
              ext: isHls ? 'm3u8' : 'mp4',
              protocol: isHls ? 'm3u8' : 'https',
              formatNote: stream.type.toUpperCase(),
            });
          }
        }
      }

      // Fallback to getSizes
      if (formats.length === 0) {
        const sizesUrl = `https://api.flickr.com/services/rest/?method=flickr.photos.getSizes&api_key=${this.API_KEY}&photo_id=${photoId}&format=json&nojsoncallback=1`;

        const sizesResponse = await this.client.get(sizesUrl, {
          headers: this.getHeaders(),
        }).json<FlickrVideoSizes & { stat: string }>();

        if (sizesResponse.stat === 'ok' && sizesResponse.sizes?.size) {
          for (const size of sizesResponse.sizes.size) {
            if (size.media === 'video' && size.source) {
              formats.push({
                url: size.source,
                formatId: size.label.toLowerCase().replace(/\s+/g, '-'),
                ext: 'mp4',
                protocol: 'https',
                width: size.width,
                height: size.height,
                formatNote: size.label,
              });
            }
          }
        }
      }

      // Sort by height (highest first)
      formats.sort((a, b) => (b.height || 0) - (a.height || 0));

      return formats;
    } catch {
      return [];
    }
  }

  /**
   * Build thumbnail URL from photo info
   */
  private buildThumbnailUrl(photo: FlickrPhoto): string {
    // Format: https://farm{farm-id}.staticflickr.com/{server-id}/{id}_{secret}_z.jpg
    return `https://farm${photo.farm}.staticflickr.com/${photo.server}/${photo.id}_${photo.secret}_z.jpg`;
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
