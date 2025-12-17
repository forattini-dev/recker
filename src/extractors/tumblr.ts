/**
 * Tumblr Extractor
 *
 * Extracts video information from Tumblr posts.
 * Microblogging platform with video support.
 *
 * @example
 * ```typescript
 * const extractor = new TumblrExtractor(client);
 * const info = await extractor.extract('https://example.tumblr.com/post/123456789');
 * ```
 */

import {
  BaseExtractor,
  ExtractorResult,
  ExtractorError,
  Format,
} from './base.js';

interface TumblrPost {
  id: string;
  slug?: string;
  blog: {
    name: string;
    title: string;
    url: string;
  };
  content?: Array<{
    type: string;
    media?: Array<{
      type: string;
      url: string;
      width?: number;
      height?: number;
    }>;
    url?: string;
    poster?: Array<{
      url: string;
      width: number;
      height: number;
    }>;
    filmstrip?: Array<{
      url: string;
    }>;
  }>;
  player?: Array<{
    embed_code: string;
    width: number;
  }>;
  video_url?: string;
  thumbnail_url?: string;
  duration?: number;
  summary?: string;
  caption?: string;
  note_count?: number;
  timestamp?: number;
}

export class TumblrExtractor extends BaseExtractor {
  readonly VALID_URL = [
    // Blog post URLs
    /https?:\/\/(?<blog>[a-zA-Z0-9-]+)\.tumblr\.com\/post\/(?<id>\d+)/,
    // www URLs
    /https?:\/\/(?:www\.)?tumblr\.com\/(?<user>[a-zA-Z0-9-]+)\/(?<post_id>\d+)/,
    // Video URLs
    /https?:\/\/(?:www\.)?tumblr\.com\/video\/(?<video_user>[a-zA-Z0-9-]+)\/(?<video_id>\d+)/,
    // Short URLs
    /https?:\/\/tmblr\.co\/(?<short_id>[a-zA-Z0-9]+)/,
  ];
  readonly IE_NAME = 'tumblr';
  readonly AGE_LIMIT = 0;

  async extract(url: string): Promise<ExtractorResult> {
    // Handle short URLs
    if (url.includes('tmblr.co')) {
      url = await this.resolveShortUrl(url);
    }

    const { blog, postId } = this.extractIds(url);

    if (!postId) {
      throw new ExtractorError('Could not extract post ID from URL');
    }

    // Get post data from webpage
    const post = await this.getPostData(url, blog, postId);

    if (!post) {
      throw new ExtractorError('Could not fetch post data');
    }

    const formats = this.buildFormats(post);

    if (formats.length === 0) {
      throw new ExtractorError('No video found in this post');
    }

    return {
      id: post.id,
      title: post.summary || post.slug || `Tumblr ${post.id}`,
      description: this.stripHtml(post.caption || ''),
      uploader: post.blog?.title || post.blog?.name,
      uploaderId: post.blog?.name,
      thumbnail: post.thumbnail_url || this.extractThumbnail(post),
      duration: post.duration,
      likeCount: post.note_count,
      isLive: false,
      formats,
    };
  }

  /**
   * Extract blog name and post ID from URL
   */
  private extractIds(url: string): { blog?: string; postId?: string } {
    // Standard tumblr.com post
    let match = url.match(/([a-zA-Z0-9-]+)\.tumblr\.com\/post\/(\d+)/);
    if (match) {
      return { blog: match[1], postId: match[2] };
    }

    // www.tumblr.com/user/id format
    match = url.match(/tumblr\.com\/([a-zA-Z0-9-]+)\/(\d+)/);
    if (match) {
      return { blog: match[1], postId: match[2] };
    }

    // Video URL format
    match = url.match(/tumblr\.com\/video\/([a-zA-Z0-9-]+)\/(\d+)/);
    if (match) {
      return { blog: match[1], postId: match[2] };
    }

    return {};
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
   * Get post data from webpage
   */
  private async getPostData(url: string, blog?: string, postId?: string): Promise<TumblrPost | null> {
    try {
      const html = await this.downloadWebpage(url);

      // Try to extract JSON data from page
      const dataMatch = html.match(/window\['___INITIAL_STATE___'\]\s*=\s*(\{.+?\});?\s*<\/script>/s) ||
                        html.match(/"postSummary":\s*(\{.+?\})\s*,\s*"blogSettings"/s);

      if (dataMatch) {
        try {
          const data = JSON.parse(dataMatch[1]);
          // Navigate to post data
          const posts = data?.queries?.[0]?.state?.data?.posts ||
                        data?.TumblelogData?.posts ||
                        [];
          if (posts.length > 0) {
            return this.normalizePost(posts[0]);
          }
        } catch {
          // Continue to regex extraction
        }
      }

      // Fallback: extract from HTML
      return this.extractFromHtml(html, blog, postId);
    } catch {
      return null;
    }
  }

  /**
   * Extract post data from HTML
   */
  private extractFromHtml(html: string, blog?: string, postId?: string): TumblrPost | null {
    const post: TumblrPost = {
      id: postId || '',
      blog: {
        name: blog || '',
        title: '',
        url: '',
      },
    };

    // Extract title
    const titleMatch = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/) ||
                       html.match(/<title>([^<]+)<\/title>/);
    if (titleMatch) {
      post.summary = titleMatch[1];
    }

    // Extract video URL from various sources
    const videoPatterns = [
      // Direct video source
      /<source[^>]+src="([^"]+\.mp4[^"]*)"/,
      /<video[^>]+src="([^"]+\.mp4[^"]*)"/,
      // Player embed
      /data-npf='[^']*"url"\s*:\s*"([^"]+\.mp4[^"]*)"/,
      // Video URL in script
      /"hdUrl"\s*:\s*"([^"]+)"/,
      /"videoUrl"\s*:\s*"([^"]+)"/,
      // Tumblr video CDN
      /https?:\/\/[^"'\s]+\.tumblr\.com\/video_file\/[^"'\s]+/,
      /https?:\/\/va\.media\.tumblr\.com\/[^"'\s]+\.mp4/,
    ];

    const videoUrls: string[] = [];
    for (const pattern of videoPatterns) {
      const matches = html.matchAll(new RegExp(pattern.source, 'g'));
      for (const match of matches) {
        const url = match[1] || match[0];
        if (url && !videoUrls.includes(url)) {
          videoUrls.push(url.replace(/\\\//g, '/'));
        }
      }
    }

    if (videoUrls.length > 0) {
      post.video_url = videoUrls[0];
    }

    // Extract thumbnail
    const thumbMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/) ||
                       html.match(/poster="([^"]+)"/);
    if (thumbMatch) {
      post.thumbnail_url = thumbMatch[1];
    }

    // Extract blog info
    const blogMatch = html.match(/<meta[^>]+name="tumblr-blog-name"[^>]+content="([^"]+)"/) ||
                      html.match(/data-blog-name="([^"]+)"/);
    if (blogMatch) {
      post.blog.name = blogMatch[1];
    }

    return post.video_url ? post : null;
  }

  /**
   * Normalize post data from various API formats
   */
  private normalizePost(rawPost: any): TumblrPost {
    const post: TumblrPost = {
      id: String(rawPost.id || rawPost.postId || ''),
      slug: rawPost.slug,
      blog: {
        name: rawPost.blog?.name || rawPost.tumblelogName || '',
        title: rawPost.blog?.title || '',
        url: rawPost.blog?.url || '',
      },
      content: rawPost.content,
      summary: rawPost.summary,
      caption: rawPost.caption,
      note_count: rawPost.noteCount || rawPost.note_count,
      timestamp: rawPost.timestamp,
    };

    // Extract video URL from content
    if (rawPost.content) {
      for (const block of rawPost.content) {
        if (block.type === 'video' && block.media) {
          const video = block.media.find((m: any) => m.type === 'video/mp4') || block.media[0];
          if (video) {
            post.video_url = video.url;
          }
          if (block.poster?.[0]) {
            post.thumbnail_url = block.poster[0].url;
          }
        }
      }
    }

    // Legacy format
    if (rawPost.video_url) {
      post.video_url = rawPost.video_url;
    }
    if (rawPost.thumbnail_url) {
      post.thumbnail_url = rawPost.thumbnail_url;
    }
    if (rawPost.duration) {
      post.duration = rawPost.duration;
    }

    return post;
  }

  /**
   * Build format list
   */
  private buildFormats(post: TumblrPost): Format[] {
    const formats: Format[] = [];

    // Main video URL
    if (post.video_url) {
      formats.push({
        url: post.video_url,
        formatId: 'mp4',
        ext: 'mp4',
        protocol: 'https',
      });
    }

    // Content block videos
    if (post.content) {
      for (const block of post.content) {
        if (block.type === 'video' && block.media) {
          for (const media of block.media) {
            if (media.url && !formats.some(f => f.url === media.url)) {
              formats.push({
                url: media.url,
                formatId: `video-${media.width || 'unknown'}`,
                ext: 'mp4',
                protocol: 'https',
                width: media.width,
                height: media.height,
              });
            }
          }
        }
      }
    }

    // Extract from player embed
    if (post.player) {
      for (const player of post.player) {
        const srcMatch = player.embed_code?.match(/src="([^"]+)"/);
        if (srcMatch && srcMatch[1].includes('.mp4')) {
          const url = srcMatch[1].replace(/&amp;/g, '&');
          if (!formats.some(f => f.url === url)) {
            formats.push({
              url,
              formatId: `embed-${player.width}`,
              ext: 'mp4',
              protocol: 'https',
              width: player.width,
            });
          }
        }
      }
    }

    return formats;
  }

  /**
   * Extract thumbnail from post
   */
  private extractThumbnail(post: TumblrPost): string | undefined {
    if (post.content) {
      for (const block of post.content) {
        if (block.poster?.[0]?.url) {
          return block.poster[0].url;
        }
      }
    }
    return undefined;
  }

  /**
   * Strip HTML tags from string
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
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
