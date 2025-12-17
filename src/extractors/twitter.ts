/**
 * Twitter/X Extractor
 *
 * Extracts video information from Twitter/X.
 * Supports tweets with videos and Twitter Spaces.
 *
 * @example
 * ```typescript
 * const extractor = new TwitterExtractor(client);
 * const info = await extractor.extract('https://twitter.com/user/status/123456789');
 * ```
 */

import {
  BaseExtractor,
  ExtractorResult,
  ExtractorError,
  Format,
} from './base.js';

// Bearer token for Twitter API
const BEARER_TOKEN = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

interface TwitterVariant {
  bitrate?: number;
  content_type: string;
  url: string;
}

interface TwitterMediaInfo {
  id_str: string;
  type: string;
  video_info?: {
    aspect_ratio: number[];
    duration_millis: number;
    variants: TwitterVariant[];
  };
  media_url_https?: string;
}

interface TwitterTweetData {
  id_str: string;
  full_text?: string;
  text?: string;
  user: {
    id_str: string;
    name: string;
    screen_name: string;
  };
  created_at: string;
  retweet_count: number;
  favorite_count: number;
  extended_entities?: {
    media: TwitterMediaInfo[];
  };
  entities?: {
    media: TwitterMediaInfo[];
  };
}

export class TwitterExtractor extends BaseExtractor {
  readonly VALID_URL = [
    // Standard tweet URLs
    /https?:\/\/(?:(?:www|m(?:obile)?)\.)?(?:twitter\.com|x\.com)\/(?:(?:i\/web|[^\/]+)\/status|statuses)\/(?<id>\d+)/,
    // Twitter Spaces
    /https?:\/\/(?:(?:www|m(?:obile)?)\.)?(?:twitter\.com|x\.com)\/i\/spaces\/(?<space_id>[a-zA-Z0-9]+)/,
  ];
  readonly IE_NAME = 'twitter';
  readonly AGE_LIMIT = 0;

  private guestToken: string | null = null;

  async extract(url: string): Promise<ExtractorResult> {
    // Check if it's a Space
    const spaceMatch = url.match(/\/i\/spaces\/([a-zA-Z0-9]+)/);
    if (spaceMatch) {
      return this.extractSpace(spaceMatch[1]);
    }

    // Extract tweet ID
    const tweetMatch = url.match(/\/status(?:es)?\/(\d+)/);
    if (!tweetMatch) {
      throw new ExtractorError('Could not extract tweet ID from URL');
    }

    const tweetId = tweetMatch[1];
    return this.extractTweet(tweetId);
  }

  /**
   * Extract tweet video
   */
  private async extractTweet(tweetId: string): Promise<ExtractorResult> {
    // Get guest token
    await this.ensureGuestToken();

    // Try GraphQL API first
    let tweetData = await this.getTweetViaGraphQL(tweetId);

    if (!tweetData) {
      // Fallback to syndication API
      tweetData = await this.getTweetViaSyndication(tweetId);
    }

    if (!tweetData) {
      throw new ExtractorError('Could not fetch tweet data');
    }

    // Extract media
    const media = tweetData.extended_entities?.media || tweetData.entities?.media || [];
    const videoMedia = media.find((m) => m.type === 'video' || m.type === 'animated_gif');

    if (!videoMedia) {
      throw new ExtractorError('No video found in this tweet');
    }

    const videoInfo = videoMedia.video_info;
    if (!videoInfo) {
      throw new ExtractorError('No video info available');
    }

    // Extract formats
    const formats: Format[] = [];

    for (const variant of videoInfo.variants) {
      if (variant.content_type === 'application/x-mpegURL') {
        // HLS
        formats.push({
          url: variant.url,
          formatId: 'hls',
          ext: 'm3u8',
          protocol: 'm3u8',
        });
      } else if (variant.content_type === 'video/mp4') {
        // Direct MP4
        const quality = this.extractQualityFromUrl(variant.url);
        formats.push({
          url: variant.url,
          formatId: `mp4-${variant.bitrate || quality || 'unknown'}`,
          ext: 'mp4',
          protocol: 'https',
          bandwidth: variant.bitrate,
          height: quality,
        });
      }
    }

    // Sort by quality
    formats.sort((a, b) => (b.bandwidth || b.height || 0) - (a.bandwidth || a.height || 0));

    if (formats.length === 0) {
      throw new ExtractorError('No playable formats found');
    }

    return {
      id: tweetId,
      title: this.generateTitle(tweetData),
      description: tweetData.full_text || tweetData.text,
      uploader: tweetData.user.name,
      uploaderId: tweetData.user.screen_name,
      thumbnail: videoMedia.media_url_https,
      duration: videoInfo.duration_millis ? Math.floor(videoInfo.duration_millis / 1000) : undefined,
      viewCount: tweetData.favorite_count,
      isLive: false,
      formats,
    };
  }

  /**
   * Extract Twitter Space
   */
  private async extractSpace(spaceId: string): Promise<ExtractorResult> {
    await this.ensureGuestToken();

    // Get space metadata
    const spaceData = await this.getSpaceData(spaceId);

    if (!spaceData) {
      throw new ExtractorError('Could not fetch Space data');
    }

    // Get space stream URL
    const streamUrl = await this.getSpaceStreamUrl(spaceData.media_key);

    if (!streamUrl) {
      throw new ExtractorError('Could not get Space stream URL');
    }

    const formats: Format[] = [{
      url: streamUrl,
      formatId: 'hls-space',
      ext: 'm3u8',
      protocol: 'm3u8',
    }];

    return {
      id: spaceId,
      title: spaceData.title || `Space by ${spaceData.creator_name}`,
      uploader: spaceData.creator_name,
      uploaderId: spaceData.creator_screen_name,
      isLive: spaceData.state === 'Running',
      formats,
    };
  }

  /**
   * Ensure we have a valid guest token
   */
  private async ensureGuestToken(): Promise<void> {
    if (this.guestToken) return;

    try {
      const response = await this.client.post(
        'https://api.twitter.com/1.1/guest/activate.json',
        {},
        {
          headers: {
            'Authorization': `Bearer ${BEARER_TOKEN}`,
          },
        }
      ).json<{ guest_token: string }>();

      this.guestToken = response.guest_token;
    } catch {
      throw new ExtractorError('Could not obtain guest token');
    }
  }

  /**
   * Get tweet data via GraphQL API
   */
  private async getTweetViaGraphQL(tweetId: string): Promise<TwitterTweetData | null> {
    const variables = {
      tweetId,
      withCommunity: false,
      includePromotedContent: false,
      withVoice: false,
    };

    const features = {
      creator_subscriptions_tweet_preview_api_enabled: true,
      communities_web_enable_tweet_community_results_fetch: true,
      c9s_tweet_anatomy_moderator_badge_enabled: true,
      articles_preview_enabled: true,
      tweetypie_unmention_optimization_enabled: true,
      responsive_web_edit_tweet_api_enabled: true,
      graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
      view_counts_everywhere_api_enabled: true,
      longform_notetweets_consumption_enabled: true,
      responsive_web_twitter_article_tweet_consumption_enabled: true,
      tweet_awards_web_tipping_enabled: false,
      creator_subscriptions_quote_tweet_preview_enabled: false,
      freedom_of_speech_not_reach_fetch_enabled: true,
      standardized_nudges_misinfo: true,
      tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
      rweb_video_timestamps_enabled: true,
      longform_notetweets_rich_text_read_enabled: true,
      longform_notetweets_inline_media_enabled: true,
      responsive_web_enhance_cards_enabled: false,
    };

    try {
      const params = new URLSearchParams({
        variables: JSON.stringify(variables),
        features: JSON.stringify(features),
      });
      const response = await this.client.get(
        `https://twitter.com/i/api/graphql/NmCeCgkVlsRGS1cAwqtgmw/TweetResultByRestId?${params}`,
        {
          headers: {
            'Authorization': `Bearer ${BEARER_TOKEN}`,
            'X-Guest-Token': this.guestToken!,
            'Content-Type': 'application/json',
          },
        }
      ).json<any>();

      const result = response.data?.tweetResult?.result;
      if (!result) return null;

      // Handle tombstone or unavailable tweets
      if (result.__typename === 'TweetTombstone' || result.__typename === 'TweetUnavailable') {
        return null;
      }

      const tweet = result.legacy || result.tweet?.legacy;
      if (!tweet) return null;

      const user = result.core?.user_results?.result?.legacy ||
                   result.tweet?.core?.user_results?.result?.legacy;

      return {
        id_str: tweetId,
        full_text: tweet.full_text,
        user: {
          id_str: user?.id_str || '',
          name: user?.name || '',
          screen_name: user?.screen_name || '',
        },
        created_at: tweet.created_at,
        retweet_count: tweet.retweet_count,
        favorite_count: tweet.favorite_count,
        extended_entities: tweet.extended_entities,
        entities: tweet.entities,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get tweet data via syndication API (fallback)
   */
  private async getTweetViaSyndication(tweetId: string): Promise<TwitterTweetData | null> {
    try {
      const params = new URLSearchParams({
        id: tweetId,
        lang: 'en',
        token: this.generateSyndicationToken(tweetId),
      });
      const response = await this.client.get(
        `https://cdn.syndication.twimg.com/tweet-result?${params}`
      ).json<any>();

      if (!response || response.tombstone) {
        return null;
      }

      // Convert syndication format to standard format
      const video = response.mediaDetails?.find((m: any) => m.type === 'video');

      if (!video) return null;

      return {
        id_str: tweetId,
        full_text: response.text,
        user: {
          id_str: response.user?.id_str || '',
          name: response.user?.name || '',
          screen_name: response.user?.screen_name || '',
        },
        created_at: response.created_at,
        retweet_count: response.retweet_count || 0,
        favorite_count: response.favorite_count || 0,
        extended_entities: {
          media: [{
            id_str: video.media_key,
            type: 'video',
            video_info: video.video_info,
            media_url_https: video.media_url_https,
          }],
        },
      };
    } catch {
      return null;
    }
  }

  /**
   * Get Space data
   */
  private async getSpaceData(spaceId: string): Promise<any | null> {
    const variables = {
      id: spaceId,
      isMetatagsQuery: false,
      withReplays: true,
      withListeners: true,
    };

    try {
      const params = new URLSearchParams({
        variables: JSON.stringify(variables),
      });
      const response = await this.client.get(
        `https://twitter.com/i/api/graphql/xVEzTzy-eHs0Lj2m5bYb7g/AudioSpaceById?${params}`,
        {
          headers: {
            'Authorization': `Bearer ${BEARER_TOKEN}`,
            'X-Guest-Token': this.guestToken!,
          },
        }
      ).json<any>();

      const space = response.data?.audioSpace?.metadata;
      if (!space) return null;

      return {
        id: spaceId,
        title: space.title,
        state: space.state,
        media_key: space.media_key,
        creator_name: space.creator_results?.result?.legacy?.name,
        creator_screen_name: space.creator_results?.result?.legacy?.screen_name,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get Space stream URL
   */
  private async getSpaceStreamUrl(mediaKey: string): Promise<string | null> {
    try {
      const response = await this.client.get(
        `https://twitter.com/i/api/1.1/live_video_stream/status/${mediaKey}`,
        {
          headers: {
            'Authorization': `Bearer ${BEARER_TOKEN}`,
            'X-Guest-Token': this.guestToken!,
          },
        }
      ).json<any>();

      return response.source?.location || null;
    } catch {
      return null;
    }
  }

  /**
   * Generate syndication token
   */
  private generateSyndicationToken(tweetId: string): string {
    // Simple token generation based on tweet ID
    const r = ((Number(tweetId) / 1e15) * Math.PI)
      .toString(6 ** 2)
      .replace(/(0+|\.)/g, '');
    return r;
  }

  /**
   * Extract quality from URL
   */
  private extractQualityFromUrl(url: string): number | undefined {
    const match = url.match(/\/vid\/(?:avc1\/)?(\d+)x(\d+)\//);
    if (match) {
      return parseInt(match[2], 10);
    }
    return undefined;
  }

  /**
   * Generate title from tweet
   */
  private generateTitle(tweet: TwitterTweetData): string {
    const text = tweet.full_text || tweet.text || '';
    const cleanText = text
      .replace(/https?:\/\/\S+/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (cleanText.length > 100) {
      return `${cleanText.substring(0, 97)}...`;
    }

    return cleanText || `Tweet by @${tweet.user.screen_name}`;
  }
}

// Also export as X for modern naming
export { TwitterExtractor as XExtractor };
