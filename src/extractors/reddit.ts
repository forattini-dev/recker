/**
 * Reddit Extractor
 *
 * Extracts video information from Reddit.
 * Supports v.redd.it videos, direct links, and gallery posts.
 *
 * @example
 * ```typescript
 * const extractor = new RedditExtractor(client);
 * const info = await extractor.extract('https://www.reddit.com/r/videos/comments/xxx/title/');
 * ```
 */

import {
  BaseExtractor,
  ExtractorResult,
  ExtractorError,
  Format,
} from './base.js';

interface RedditPostData {
  id: string;
  title: string;
  author: string;
  subreddit: string;
  created_utc: number;
  score: number;
  num_comments: number;
  permalink: string;
  is_video: boolean;
  media?: {
    reddit_video?: {
      fallback_url: string;
      hls_url: string;
      dash_url: string;
      width: number;
      height: number;
      duration: number;
      scrubber_media_url?: string;
    };
  };
  secure_media?: {
    reddit_video?: {
      fallback_url: string;
      hls_url: string;
      dash_url: string;
      width: number;
      height: number;
      duration: number;
    };
  };
  preview?: {
    reddit_video_preview?: {
      fallback_url: string;
      hls_url: string;
      dash_url: string;
      width: number;
      height: number;
      duration: number;
    };
    images?: Array<{
      source: { url: string; width: number; height: number };
    }>;
  };
  crosspost_parent_list?: RedditPostData[];
  url_overridden_by_dest?: string;
  thumbnail?: string;
}

export class RedditExtractor extends BaseExtractor {
  readonly VALID_URL = [
    // Standard post URLs
    /https?:\/\/(?:www\.)?reddit\.com\/r\/[^\/]+\/comments\/(?<id>[a-zA-Z0-9]+)/,
    // Short URLs
    /https?:\/\/(?:www\.)?redd\.it\/(?<short_id>[a-zA-Z0-9]+)/,
    // v.redd.it direct URLs
    /https?:\/\/v\.redd\.it\/(?<video_id>[a-zA-Z0-9]+)/,
    // Old reddit
    /https?:\/\/old\.reddit\.com\/r\/[^\/]+\/comments\/(?<old_id>[a-zA-Z0-9]+)/,
    // Share URLs
    /https?:\/\/(?:www\.)?reddit\.com\/(?<share_id>[a-zA-Z0-9]+)/,
  ];
  readonly IE_NAME = 'reddit';
  readonly AGE_LIMIT = 0;

  async extract(url: string): Promise<ExtractorResult> {
    // Normalize URL to JSON endpoint
    const jsonUrl = await this.normalizeUrl(url);

    // Fetch post data
    const postData = await this.getPostData(jsonUrl);

    if (!postData) {
      throw new ExtractorError('Could not fetch post data');
    }

    // Check for crosspost
    let videoSource = postData;
    if (postData.crosspost_parent_list?.length) {
      videoSource = postData.crosspost_parent_list[0];
    }

    // Find video data
    const redditVideo = videoSource.media?.reddit_video ||
                        videoSource.secure_media?.reddit_video ||
                        videoSource.preview?.reddit_video_preview;

    if (!redditVideo) {
      // Check if it's an external video link
      if (videoSource.url_overridden_by_dest) {
        throw new ExtractorError(
          `This post links to external video: ${videoSource.url_overridden_by_dest}. ` +
          'Use the appropriate extractor for that site.'
        );
      }
      throw new ExtractorError('No video found in this post');
    }

    const formats: Format[] = [];

    // HLS (adaptive, preferred)
    if (redditVideo.hls_url) {
      formats.push({
        url: redditVideo.hls_url,
        formatId: 'hls',
        ext: 'm3u8',
        protocol: 'm3u8',
        width: redditVideo.width,
        height: redditVideo.height,
      });
    }

    // DASH
    if (redditVideo.dash_url) {
      formats.push({
        url: redditVideo.dash_url,
        formatId: 'dash',
        ext: 'mpd',
        protocol: 'mpd',
        width: redditVideo.width,
        height: redditVideo.height,
      });
    }

    // Fallback MP4 (video only, no audio)
    if (redditVideo.fallback_url) {
      // Extract available qualities from fallback URL
      const qualities = await this.extractFallbackQualities(redditVideo.fallback_url);

      for (const quality of qualities) {
        formats.push({
          url: quality.url,
          formatId: `mp4-${quality.height}p`,
          ext: 'mp4',
          protocol: 'https',
          height: quality.height,
          // Note: fallback URLs are video-only
          acodec: 'none',
        });
      }

      // Add audio track separately if available
      const audioUrl = redditVideo.fallback_url.replace(/DASH_\d+\.mp4/, 'DASH_audio.mp4');
      formats.push({
        url: audioUrl,
        formatId: 'audio',
        ext: 'mp4',
        protocol: 'https',
        vcodec: 'none',
      });
    }

    // Sort by quality
    formats.sort((a, b) => (b.height || 0) - (a.height || 0));

    if (formats.length === 0) {
      throw new ExtractorError('No playable formats found');
    }

    // Get thumbnail
    const thumbnail = postData.preview?.images?.[0]?.source?.url?.replace(/&amp;/g, '&') ||
                      postData.thumbnail;

    return {
      id: postData.id,
      title: postData.title,
      uploader: postData.author,
      uploaderId: `u/${postData.author}`,
      thumbnail,
      duration: redditVideo.duration,
      viewCount: postData.score,
      commentCount: postData.num_comments,
      timestamp: postData.created_utc,
      isLive: false,
      formats,
    };
  }

  /**
   * Normalize URL to JSON endpoint
   */
  private async normalizeUrl(url: string): Promise<string> {
    // Handle v.redd.it URLs - follow redirects by fetching HEAD
    if (url.includes('v.redd.it')) {
      try {
        // Fetch the page to get the redirected URL
        const html = await this.client.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Recker/1.0)',
          },
        }).text();
        // Try to find the canonical URL in the HTML
        const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
        if (canonicalMatch) {
          url = canonicalMatch[1];
        }
      } catch {
        // Continue with original URL
      }
    }

    // Handle short URLs (redd.it)
    if (url.includes('redd.it') && !url.includes('v.redd.it')) {
      try {
        // Fetch the page to get the redirected URL
        const html = await this.client.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Recker/1.0)',
          },
        }).text();
        const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
        if (canonicalMatch) {
          url = canonicalMatch[1];
        }
      } catch {
        // Continue with original URL
      }
    }

    // Remove trailing slashes and add .json
    url = url.replace(/\/?(\?.*)?$/, '');

    // Make sure it's a full post URL
    if (!url.includes('/comments/')) {
      // This might be a share link or short link
      const match = url.match(/reddit\.com\/([a-zA-Z0-9]+)$/);
      if (match) {
        url = `https://www.reddit.com/comments/${match[1]}`;
      }
    }

    return `${url}.json`;
  }

  /**
   * Get post data from Reddit API
   */
  private async getPostData(jsonUrl: string): Promise<RedditPostData | null> {
    try {
      const response = await this.client.get(jsonUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Recker/1.0)',
          'Accept': 'application/json',
        },
      }).json<any>();

      // Reddit returns an array with [post, comments]
      const postData = response[0]?.data?.children?.[0]?.data;
      return postData || null;
    } catch {
      return null;
    }
  }

  /**
   * Extract available qualities from fallback URL
   */
  private async extractFallbackQualities(
    fallbackUrl: string
  ): Promise<Array<{ url: string; height: number }>> {
    const qualities: Array<{ url: string; height: number }> = [];

    // Common Reddit video heights
    const heights = [1080, 720, 480, 360, 240, 96];

    // Get base URL
    const baseUrl = fallbackUrl.replace(/DASH_\d+\.mp4.*$/, '');

    for (const height of heights) {
      const url = `${baseUrl}DASH_${height}.mp4`;
      qualities.push({ url, height });
    }

    // Also add the original fallback
    const originalMatch = fallbackUrl.match(/DASH_(\d+)\.mp4/);
    if (originalMatch) {
      const height = parseInt(originalMatch[1], 10);
      if (!heights.includes(height)) {
        qualities.push({
          url: fallbackUrl.split('?')[0],
          height,
        });
      }
    }

    return qualities;
  }
}
