/**
 * 9GAG Extractor
 *
 * Extracts video information from 9GAG.
 * Meme and entertainment platform.
 *
 * @example
 * ```typescript
 * const extractor = new NineGagExtractor(client);
 * const info = await extractor.extract('https://9gag.com/gag/abcdef');
 * ```
 */

import {
  BaseExtractor,
  ExtractorResult,
  ExtractorError,
  Format,
} from './base.js';

interface NineGagPost {
  id: string;
  title: string;
  description?: string;
  type: string;
  images: {
    image700?: {
      url: string;
      width: number;
      height: number;
    };
    image460sv?: {
      url: string;
      width: number;
      height: number;
      duration: number;
      hasAudio: number;
      vp9Url?: string;
      h265Url?: string;
    };
    image460svwm?: {
      url: string;
      width: number;
      height: number;
    };
  };
  upVoteCount?: number;
  downVoteCount?: number;
  commentsCount?: number;
  creationTs?: number;
  creator?: {
    username: string;
    userId: string;
  };
}

export class NineGagExtractor extends BaseExtractor {
  readonly VALID_URL = [
    // Standard post URLs
    /https?:\/\/(?:www\.)?9gag\.com\/gag\/(?<id>[a-zA-Z0-9]+)/,
    // TV section
    /https?:\/\/(?:www\.)?9gag\.com\/tv\/p\/(?<tv_id>[a-zA-Z0-9]+)/,
  ];
  readonly IE_NAME = '9gag';
  readonly AGE_LIMIT = 0;

  async extract(url: string): Promise<ExtractorResult> {
    const postId = this.extractPostId(url);

    if (!postId) {
      throw new ExtractorError('Could not extract post ID from URL');
    }

    // Fetch post data
    const post = await this.getPostData(postId);

    if (!post) {
      throw new ExtractorError('Could not fetch post data');
    }

    if (post.type !== 'Animated' && post.type !== 'Video') {
      throw new ExtractorError('This post is not a video');
    }

    const formats = this.buildFormats(post);

    if (formats.length === 0) {
      throw new ExtractorError('No playable formats found');
    }

    return {
      id: postId,
      title: post.title,
      description: post.description,
      uploader: post.creator?.username,
      uploaderId: post.creator?.userId,
      thumbnail: post.images.image700?.url,
      duration: post.images.image460sv?.duration,
      viewCount: post.upVoteCount,
      commentCount: post.commentsCount,
      isLive: false,
      formats,
    };
  }

  /**
   * Extract post ID from URL
   */
  private extractPostId(url: string): string | null {
    const match = url.match(/\/gag\/([a-zA-Z0-9]+)/) ||
                  url.match(/\/tv\/p\/([a-zA-Z0-9]+)/);
    return match?.[1] || null;
  }

  /**
   * Get post data from API
   */
  private async getPostData(postId: string): Promise<NineGagPost | null> {
    try {
      const response = await this.client.get(
        `https://9gag.com/v1/post?id=${postId}`,
        {
          headers: this.getHeaders(),
        }
      ).json<{ data: { post: NineGagPost } }>();

      return response.data?.post || null;
    } catch {
      // Try extracting from webpage
      return this.extractFromWebpage(postId);
    }
  }

  /**
   * Extract from webpage
   */
  private async extractFromWebpage(postId: string): Promise<NineGagPost | null> {
    try {
      const html = await this.downloadWebpage(`https://9gag.com/gag/${postId}`);

      // Find JSON data in page
      const dataMatch = html.match(/window\._config\s*=\s*JSON\.parse\("(.+?)"\);/);
      if (!dataMatch) return null;

      const decoded = dataMatch[1]
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');

      const config = JSON.parse(decoded);
      return config.data?.post || null;
    } catch {
      return null;
    }
  }

  /**
   * Build format list
   */
  private buildFormats(post: NineGagPost): Format[] {
    const formats: Format[] = [];
    const video = post.images.image460sv;

    if (!video) return formats;

    // Main MP4
    if (video.url) {
      formats.push({
        url: video.url,
        formatId: 'mp4',
        ext: 'mp4',
        protocol: 'https',
        width: video.width,
        height: video.height,
      });
    }

    // VP9 version (usually higher quality)
    if (video.vp9Url) {
      formats.push({
        url: video.vp9Url,
        formatId: 'vp9',
        ext: 'webm',
        protocol: 'https',
        width: video.width,
        height: video.height,
      });
    }

    // H.265 version
    if (video.h265Url) {
      formats.push({
        url: video.h265Url,
        formatId: 'h265',
        ext: 'mp4',
        protocol: 'https',
        width: video.width,
        height: video.height,
      });
    }

    // Watermarked version
    const watermarked = post.images.image460svwm;
    if (watermarked?.url) {
      formats.push({
        url: watermarked.url,
        formatId: 'mp4-watermarked',
        ext: 'mp4',
        protocol: 'https',
        width: watermarked.width,
        height: watermarked.height,
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
      'Referer': 'https://9gag.com/',
    };
  }
}
