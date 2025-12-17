/**
 * Instagram Extractor
 *
 * Extracts video information from Instagram.
 * Supports posts, reels, stories (with login), and IGTV.
 *
 * @example
 * ```typescript
 * const extractor = new InstagramExtractor(client);
 * const info = await extractor.extract('https://instagram.com/p/ABC123/');
 * ```
 */

import {
  BaseExtractor,
  ExtractorResult,
  ExtractorError,
  Format,
} from './base.js';

interface InstagramMediaData {
  id: string;
  shortcode: string;
  typename: string;
  display_url: string;
  video_url?: string;
  is_video: boolean;
  video_view_count?: number;
  edge_media_preview_like?: { count: number };
  edge_media_to_comment?: { count: number };
  taken_at_timestamp: number;
  owner: {
    id: string;
    username: string;
    full_name?: string;
  };
  edge_media_to_caption?: {
    edges: Array<{ node: { text: string } }>;
  };
  video_duration?: number;
  dimensions: {
    width: number;
    height: number;
  };
  edge_sidecar_to_children?: {
    edges: Array<{ node: InstagramMediaData }>;
  };
}

export class InstagramExtractor extends BaseExtractor {
  readonly VALID_URL = [
    // Posts and Reels
    /https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|reels|tv)\/(?<shortcode>[a-zA-Z0-9_-]+)/,
    // Stories (requires login)
    /https?:\/\/(?:www\.)?instagram\.com\/stories\/(?<user>[^\/]+)\/(?<story_id>\d+)/,
    // Profile with highlights
    /https?:\/\/(?:www\.)?instagram\.com\/(?<profile_user>[a-zA-Z0-9_.]+)\/?(?:\?.*)?$/,
  ];
  readonly IE_NAME = 'instagram';
  readonly AGE_LIMIT = 0;

  async extract(url: string): Promise<ExtractorResult> {
    // Check content type
    const postMatch = url.match(/\/(?:p|reel|reels|tv)\/([a-zA-Z0-9_-]+)/);
    const storyMatch = url.match(/\/stories\/([^\/]+)\/(\d+)/);

    if (postMatch) {
      return this.extractPost(postMatch[1]);
    }

    if (storyMatch) {
      throw new ExtractorError('Instagram stories require login (not supported yet)');
    }

    throw new ExtractorError('Could not determine content type from URL');
  }

  /**
   * Extract post/reel/IGTV
   */
  private async extractPost(shortcode: string): Promise<ExtractorResult> {
    // Try multiple extraction methods
    let mediaData = await this.extractViaWebpage(shortcode);

    if (!mediaData) {
      mediaData = await this.extractViaEmbed(shortcode);
    }

    if (!mediaData) {
      throw new ExtractorError('Could not extract media data. The post may be private or require login.');
    }

    // Handle carousel posts
    if (mediaData.edge_sidecar_to_children) {
      // For carousel, extract first video
      const videoItem = mediaData.edge_sidecar_to_children.edges.find(
        (e) => e.node.is_video
      );
      if (videoItem) {
        mediaData = videoItem.node;
      } else {
        throw new ExtractorError('No video found in this carousel post');
      }
    }

    if (!mediaData.is_video || !mediaData.video_url) {
      throw new ExtractorError('No video found in this post');
    }

    const formats: Format[] = [{
      url: mediaData.video_url,
      formatId: 'video',
      ext: 'mp4',
      protocol: 'https',
      width: mediaData.dimensions.width,
      height: mediaData.dimensions.height,
    }];

    const caption = mediaData.edge_media_to_caption?.edges?.[0]?.node?.text || '';

    return {
      id: shortcode,
      title: this.generateTitle(mediaData.owner.username, caption),
      description: caption,
      uploader: mediaData.owner.full_name || mediaData.owner.username,
      uploaderId: mediaData.owner.username,
      thumbnail: mediaData.display_url,
      duration: mediaData.video_duration,
      viewCount: mediaData.video_view_count,
      likeCount: mediaData.edge_media_preview_like?.count,
      commentCount: mediaData.edge_media_to_comment?.count,
      timestamp: mediaData.taken_at_timestamp,
      isLive: false,
      formats,
    };
  }

  /**
   * Extract via webpage
   */
  private async extractViaWebpage(shortcode: string): Promise<InstagramMediaData | null> {
    try {
      const webpage = await this.downloadWebpage(`https://www.instagram.com/p/${shortcode}/`);

      // Try to find shared data
      const sharedDataMatch = webpage.match(
        /window\._sharedData\s*=\s*(\{.+?\});<\/script>/s
      );

      if (sharedDataMatch) {
        const sharedData = JSON.parse(sharedDataMatch[1]);
        const media = sharedData.entry_data?.PostPage?.[0]?.graphql?.shortcode_media;
        if (media) {
          return this.normalizeMediaData(media);
        }
      }

      // Try additional data
      const additionalDataMatch = webpage.match(
        /window\.__additionalDataLoaded\s*\([^,]+,\s*(\{.+?\})\)/s
      );

      if (additionalDataMatch) {
        const additionalData = JSON.parse(additionalDataMatch[1]);
        const media = additionalData.graphql?.shortcode_media ||
                      additionalData.items?.[0];
        if (media) {
          return this.normalizeMediaData(media);
        }
      }

      // Try JSON-LD
      const jsonLdMatch = webpage.match(
        /<script type="application\/ld\+json">(\{.+?\})<\/script>/s
      );

      if (jsonLdMatch) {
        const jsonLd = JSON.parse(jsonLdMatch[1]);
        if (jsonLd.video) {
          return {
            id: shortcode,
            shortcode,
            typename: 'GraphVideo',
            display_url: jsonLd.thumbnailUrl || '',
            video_url: jsonLd.video[0]?.contentUrl || jsonLd.contentUrl,
            is_video: true,
            taken_at_timestamp: new Date(jsonLd.uploadDate).getTime() / 1000,
            owner: {
              id: '',
              username: jsonLd.author?.identifier?.value || 'instagram',
              full_name: jsonLd.author?.name,
            },
            dimensions: {
              width: jsonLd.video?.[0]?.width || 0,
              height: jsonLd.video?.[0]?.height || 0,
            },
          };
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Extract via embed endpoint
   */
  private async extractViaEmbed(shortcode: string): Promise<InstagramMediaData | null> {
    try {
      // Try the public embed endpoint
      const response = await this.client.get(
        `https://www.instagram.com/p/${shortcode}/embed/`,
        {
          headers: this.getHeaders(),
        }
      ).text();

      // Extract video URL from embed
      const videoMatch = response.match(/"video_url"\s*:\s*"([^"]+)"/);
      const thumbnailMatch = response.match(/"thumbnail_src"\s*:\s*"([^"]+)"/);
      const usernameMatch = response.match(/"owner"\s*:\s*\{[^}]*"username"\s*:\s*"([^"]+)"/);

      if (videoMatch) {
        const videoUrl = videoMatch[1].replace(/\\u0026/g, '&');

        return {
          id: shortcode,
          shortcode,
          typename: 'GraphVideo',
          display_url: thumbnailMatch?.[1]?.replace(/\\u0026/g, '&') || '',
          video_url: videoUrl,
          is_video: true,
          taken_at_timestamp: Date.now() / 1000,
          owner: {
            id: '',
            username: usernameMatch?.[1] || 'instagram',
          },
          dimensions: { width: 0, height: 0 },
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Normalize media data from various sources
   */
  private normalizeMediaData(data: any): InstagramMediaData {
    return {
      id: data.id || data.pk,
      shortcode: data.shortcode || data.code,
      typename: data.__typename || data.media_type,
      display_url: data.display_url || data.thumbnail_url || data.image_versions2?.candidates?.[0]?.url || '',
      video_url: data.video_url || data.video_versions?.[0]?.url,
      is_video: data.is_video || data.media_type === 2,
      video_view_count: data.video_view_count || data.view_count,
      edge_media_preview_like: data.edge_media_preview_like || { count: data.like_count || 0 },
      edge_media_to_comment: data.edge_media_to_comment || { count: data.comment_count || 0 },
      taken_at_timestamp: data.taken_at_timestamp || data.taken_at,
      owner: {
        id: data.owner?.id || data.user?.pk || '',
        username: data.owner?.username || data.user?.username || '',
        full_name: data.owner?.full_name || data.user?.full_name,
      },
      edge_media_to_caption: data.edge_media_to_caption || {
        edges: data.caption ? [{ node: { text: data.caption.text || data.caption } }] : [],
      },
      video_duration: data.video_duration,
      dimensions: data.dimensions || {
        width: data.original_width || 0,
        height: data.original_height || 0,
      },
      edge_sidecar_to_children: data.edge_sidecar_to_children,
    };
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

  /**
   * Generate title from username and caption
   */
  private generateTitle(username: string, caption: string): string {
    if (caption) {
      const cleanCaption = caption
        .replace(/\n+/g, ' ')
        .replace(/#\w+/g, '')
        .replace(/@\w+/g, '')
        .trim();

      if (cleanCaption.length > 100) {
        return `${cleanCaption.substring(0, 97)}...`;
      }

      return cleanCaption || `Video by @${username}`;
    }

    return `Video by @${username}`;
  }
}
