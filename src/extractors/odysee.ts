/**
 * Odysee/LBRY Extractor
 *
 * Extracts video information from Odysee (formerly LBRY).
 * Decentralized video platform.
 *
 * @example
 * ```typescript
 * const extractor = new OdyseeExtractor(client);
 * const info = await extractor.extract('https://odysee.com/@channel/video');
 * ```
 */

import {
  BaseExtractor,
  ExtractorResult,
  ExtractorError,
  Format,
} from './base.js';

interface OdyseeClaimData {
  claim_id: string;
  name: string;
  title: string;
  description?: string;
  thumbnail?: {
    url: string;
  };
  video?: {
    duration: number;
    width: number;
    height: number;
  };
  release_time?: number;
  signing_channel?: {
    name: string;
    claim_id: string;
  };
  view_count?: number;
  like_count?: number;
  streaming_url?: string;
}

export class OdyseeExtractor extends BaseExtractor {
  readonly VALID_URL = [
    // Standard video URLs
    /https?:\/\/(?:www\.)?odysee\.com\/(?<channel>@[^\/]+)\/(?<video>[^\/\?]+)/,
    // Direct claim URLs
    /https?:\/\/(?:www\.)?odysee\.com\/\$\/download\/(?<download_name>[^\/]+)\/(?<download_id>[a-f0-9]+)/,
    // Embed URLs
    /https?:\/\/(?:www\.)?odysee\.com\/\$\/embed\/(?<embed_name>[^\/]+)\/(?<embed_id>[a-f0-9]+)/,
    // LBRY URLs
    /https?:\/\/(?:www\.)?lbry\.tv\/(?<lbry_channel>@[^\/]+)\/(?<lbry_video>[^\/\?]+)/,
  ];
  readonly IE_NAME = 'odysee';
  readonly AGE_LIMIT = 0;

  async extract(url: string): Promise<ExtractorResult> {
    // Convert URL to claim URL
    const claimUrl = this.normalizeUrl(url);

    // Resolve claim
    const claimData = await this.resolveClaim(claimUrl);

    if (!claimData) {
      throw new ExtractorError('Could not resolve video claim');
    }

    // Get streaming URL
    const streamingUrl = await this.getStreamingUrl(claimData.claim_id, claimData.name);

    if (!streamingUrl) {
      throw new ExtractorError('Could not get streaming URL');
    }

    const formats: Format[] = [];

    // Check if it's HLS
    if (streamingUrl.includes('.m3u8')) {
      formats.push({
        url: streamingUrl,
        formatId: 'hls',
        ext: 'm3u8',
        protocol: 'm3u8',
        width: claimData.video?.width,
        height: claimData.video?.height,
      });
    } else {
      formats.push({
        url: streamingUrl,
        formatId: 'source',
        ext: 'mp4',
        protocol: 'https',
        width: claimData.video?.width,
        height: claimData.video?.height,
      });
    }

    if (formats.length === 0) {
      throw new ExtractorError('No playable formats found');
    }

    return {
      id: claimData.claim_id,
      title: claimData.title || claimData.name,
      description: claimData.description,
      uploader: claimData.signing_channel?.name?.replace('@', ''),
      uploaderId: claimData.signing_channel?.claim_id,
      thumbnail: claimData.thumbnail?.url,
      duration: claimData.video?.duration,
      viewCount: claimData.view_count,
      likeCount: claimData.like_count,
      isLive: false,
      formats,
    };
  }

  /**
   * Normalize URL to lbry:// format
   */
  private normalizeUrl(url: string): string {
    // Extract channel and video from URL
    const match = url.match(/odysee\.com\/(@[^\/]+)\/([^\/\?]+)/) ||
                  url.match(/lbry\.tv\/(@[^\/]+)\/([^\/\?]+)/);

    if (match) {
      const channel = decodeURIComponent(match[1]);
      const video = decodeURIComponent(match[2]);
      return `lbry://${channel}/${video}`;
    }

    // Embed URL
    const embedMatch = url.match(/embed\/([^\/]+)\/([a-f0-9]+)/);
    if (embedMatch) {
      return `lbry://${decodeURIComponent(embedMatch[1])}#${embedMatch[2]}`;
    }

    return url;
  }

  /**
   * Resolve claim via API
   */
  private async resolveClaim(claimUrl: string): Promise<OdyseeClaimData | null> {
    try {
      const response = await this.client.post(
        'https://api.odysee.com/api/v1/proxy?m=resolve',
        {
          jsonrpc: '2.0',
          method: 'resolve',
          params: {
            urls: [claimUrl],
          },
          id: Date.now(),
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
        }
      ).json<any>();

      const result = response.result?.[claimUrl];
      if (!result || result.error) return null;

      const claim = result;
      const value = claim.value || {};

      return {
        claim_id: claim.claim_id,
        name: claim.name,
        title: value.title || claim.name,
        description: value.description,
        thumbnail: value.thumbnail,
        video: value.video,
        release_time: value.release_time,
        signing_channel: claim.signing_channel,
        streaming_url: value.source?.url,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get streaming URL
   */
  private async getStreamingUrl(claimId: string, claimName: string): Promise<string | null> {
    try {
      const response = await this.client.post(
        'https://api.odysee.com/api/v1/proxy?m=get',
        {
          jsonrpc: '2.0',
          method: 'get',
          params: {
            uri: `lbry://${claimName}#${claimId}`,
            save_file: false,
          },
          id: Date.now(),
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
        }
      ).json<any>();

      return response.result?.streaming_url || null;
    } catch {
      // Fallback: construct URL directly
      return `https://player.odycdn.com/v6/streams/${claimId}/${claimId}.m3u8`;
    }
  }
}
