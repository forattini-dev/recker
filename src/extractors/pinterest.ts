/**
 * Pinterest Extractor
 *
 * Extracts video information from Pinterest pins.
 * Image and video sharing platform.
 *
 * @example
 * ```typescript
 * const extractor = new PinterestExtractor(client);
 * const info = await extractor.extract('https://www.pinterest.com/pin/123456789/');
 * ```
 */

import {
  BaseExtractor,
  ExtractorResult,
  ExtractorError,
  Format,
} from './base.js';

interface PinterestPin {
  id: string;
  title?: string;
  description?: string;
  grid_title?: string;
  domain?: string;
  pinner?: {
    id: string;
    username: string;
    full_name: string;
  };
  board?: {
    name: string;
  };
  images?: {
    orig?: { url: string; width: number; height: number };
    '736x'?: { url: string; width: number; height: number };
  };
  videos?: {
    video_list?: Record<string, {
      url: string;
      width: number;
      height: number;
      duration: number;
      thumbnail: string;
    }>;
  };
  story_pin_data?: {
    pages?: Array<{
      blocks?: Array<{
        video?: {
          video_list?: Record<string, {
            url: string;
            width: number;
            height: number;
          }>;
        };
      }>;
    }>;
  };
  created_at?: string;
  repin_count?: number;
  comment_count?: number;
  aggregated_pin_data?: {
    aggregated_stats?: {
      saves: number;
    };
  };
}

export class PinterestExtractor extends BaseExtractor {
  readonly VALID_URL = [
    // Standard pin URLs
    /https?:\/\/(?:www\.)?pinterest\.(?:com|co\.uk|de|fr|es|it|ca)\/pin\/(?<id>\d+)/,
    // Pin with slug
    /https?:\/\/(?:www\.)?pinterest\.(?:com|co\.uk|de|fr|es|it|ca)\/pin\/[^\/]+--(?<slug_id>\d+)/,
    // Short URLs
    /https?:\/\/pin\.it\/(?<short_id>[a-zA-Z0-9]+)/,
  ];
  readonly IE_NAME = 'pinterest';
  readonly AGE_LIMIT = 0;

  async extract(url: string): Promise<ExtractorResult> {
    // Handle short URLs
    if (url.includes('pin.it')) {
      url = await this.resolveShortUrl(url);
    }

    const pinId = this.extractPinId(url);

    if (!pinId) {
      throw new ExtractorError('Could not extract pin ID from URL');
    }

    // Get pin data
    const pin = await this.getPinData(pinId);

    if (!pin) {
      throw new ExtractorError('Could not fetch pin data');
    }

    const formats = this.buildFormats(pin);

    if (formats.length === 0) {
      throw new ExtractorError('No video found in this pin');
    }

    const thumbnail = pin.images?.orig?.url ||
                      pin.images?.['736x']?.url ||
                      this.extractVideoThumbnail(pin);

    return {
      id: pinId,
      title: pin.title || pin.grid_title || pin.description || `Pinterest ${pinId}`,
      description: pin.description,
      uploader: pin.pinner?.full_name || pin.pinner?.username,
      uploaderId: pin.pinner?.id,
      thumbnail,
      likeCount: pin.aggregated_pin_data?.aggregated_stats?.saves,
      commentCount: pin.comment_count,
      isLive: false,
      formats,
    };
  }

  /**
   * Extract pin ID from URL
   */
  private extractPinId(url: string): string | null {
    // Standard format
    let match = url.match(/\/pin\/(\d+)/);
    if (match) return match[1];

    // With slug
    match = url.match(/\/pin\/[^\/]+--(\d+)/);
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
   * Get pin data from API
   */
  private async getPinData(pinId: string): Promise<PinterestPin | null> {
    try {
      // Try API endpoint
      const apiUrl = `https://www.pinterest.com/resource/PinResource/get/?source_url=/pin/${pinId}/&data={"options":{"id":"${pinId}","field_set_key":"detailed"},"context":{}}`;

      const response = await this.client.get(apiUrl, {
        headers: this.getHeaders(),
      }).json<{ resource_response?: { data?: PinterestPin } }>();

      if (response.resource_response?.data) {
        return response.resource_response.data;
      }

      // Fallback to webpage
      return this.extractFromWebpage(pinId);
    } catch {
      return this.extractFromWebpage(pinId);
    }
  }

  /**
   * Extract pin data from webpage
   */
  private async extractFromWebpage(pinId: string): Promise<PinterestPin | null> {
    try {
      const html = await this.downloadWebpage(`https://www.pinterest.com/pin/${pinId}/`);

      // Find JSON data in page
      const dataMatch = html.match(/<script[^>]+id="__PWS_DATA__"[^>]*>([^<]+)<\/script>/) ||
                        html.match(/<script[^>]+data-relay-response="true"[^>]*>([^<]+)<\/script>/);

      if (dataMatch) {
        const data = JSON.parse(dataMatch[1]);

        // Navigate to pin data
        const pin = data?.props?.initialReduxState?.pins?.[pinId] ||
                    data?.response?.data?.v3GetPinQuery?.data;

        if (pin) {
          return this.normalizePin(pin);
        }
      }

      // Try to find video URL directly
      return this.extractVideoFromHtml(html, pinId);
    } catch {
      return null;
    }
  }

  /**
   * Extract video from HTML
   */
  private extractVideoFromHtml(html: string, pinId: string): PinterestPin | null {
    const pin: PinterestPin = {
      id: pinId,
    };

    // Extract video URL
    const videoMatch = html.match(/"url"\s*:\s*"(https:\/\/v\d*\.pinimg\.com\/videos\/[^"]+)"/) ||
                       html.match(/https:\/\/v\d*\.pinimg\.com\/videos\/[^\s"']+\.mp4/);

    if (videoMatch) {
      const videoUrl = videoMatch[1] || videoMatch[0];
      pin.videos = {
        video_list: {
          'V_720P': {
            url: videoUrl.replace(/\\\//g, '/'),
            width: 720,
            height: 1280,
            duration: 0,
            thumbnail: '',
          },
        },
      };
    }

    // Extract title
    const titleMatch = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/) ||
                       html.match(/"title"\s*:\s*"([^"]+)"/);
    if (titleMatch) {
      pin.title = titleMatch[1];
    }

    // Extract thumbnail
    const thumbMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/);
    if (thumbMatch) {
      pin.images = {
        orig: {
          url: thumbMatch[1],
          width: 0,
          height: 0,
        },
      };
    }

    return pin.videos ? pin : null;
  }

  /**
   * Normalize pin data from various formats
   */
  private normalizePin(rawPin: any): PinterestPin {
    return {
      id: rawPin.id || rawPin.entityId,
      title: rawPin.title || rawPin.gridTitle,
      description: rawPin.description || rawPin.closeupDescription,
      grid_title: rawPin.gridTitle || rawPin.grid_title,
      pinner: rawPin.pinner || rawPin.nativeCreator,
      board: rawPin.board,
      images: rawPin.images || rawPin.imageLargeUrl ? {
        orig: { url: rawPin.imageLargeUrl || rawPin.imageUrl, width: 0, height: 0 }
      } : undefined,
      videos: rawPin.videos || rawPin.videoData,
      story_pin_data: rawPin.storyPinData || rawPin.story_pin_data,
      repin_count: rawPin.repinCount || rawPin.repin_count,
      comment_count: rawPin.commentCount || rawPin.comment_count,
      aggregated_pin_data: rawPin.aggregatedPinData || rawPin.aggregated_pin_data,
    };
  }

  /**
   * Build format list
   */
  private buildFormats(pin: PinterestPin): Format[] {
    const formats: Format[] = [];

    // Regular video formats
    if (pin.videos?.video_list) {
      const qualities = ['V_EXP7', 'V_720P', 'V_480P', 'V_360P', 'V_HLSV4', 'V_HLSV3_WEB'];

      for (const quality of qualities) {
        const video = pin.videos.video_list[quality];
        if (video?.url) {
          const isHls = quality.includes('HLS');

          formats.push({
            url: video.url,
            formatId: quality.toLowerCase(),
            ext: isHls ? 'm3u8' : 'mp4',
            protocol: isHls ? 'm3u8' : 'https',
            width: video.width,
            height: video.height,
          });
        }
      }

      // Also check for other formats
      for (const [key, video] of Object.entries(pin.videos.video_list)) {
        if (video?.url && !formats.some(f => f.url === video.url)) {
          formats.push({
            url: video.url,
            formatId: key.toLowerCase(),
            ext: video.url.includes('.m3u8') ? 'm3u8' : 'mp4',
            protocol: video.url.includes('.m3u8') ? 'm3u8' : 'https',
            width: video.width,
            height: video.height,
          });
        }
      }
    }

    // Story pin videos
    if (pin.story_pin_data?.pages) {
      for (const page of pin.story_pin_data.pages) {
        for (const block of page.blocks || []) {
          if (block.video?.video_list) {
            for (const [key, video] of Object.entries(block.video.video_list)) {
              if (video?.url && !formats.some(f => f.url === video.url)) {
                formats.push({
                  url: video.url,
                  formatId: `story-${key.toLowerCase()}`,
                  ext: 'mp4',
                  protocol: 'https',
                  width: video.width,
                  height: video.height,
                });
              }
            }
          }
        }
      }
    }

    // Sort by height (highest first)
    formats.sort((a, b) => (b.height || 0) - (a.height || 0));

    return formats;
  }

  /**
   * Extract video thumbnail
   */
  private extractVideoThumbnail(pin: PinterestPin): string | undefined {
    if (pin.videos?.video_list) {
      for (const video of Object.values(pin.videos.video_list)) {
        if (video?.thumbnail) {
          return video.thumbnail;
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
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'Accept-Language': 'en-US,en;q=0.5',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'X-Requested-With': 'XMLHttpRequest',
      'X-Pinterest-PWS-Handler': 'www/pin/[id].js',
    };
  }
}
