/**
 * MCP Video Tools
 *
 * Tools for video/audio extraction from 35+ platforms.
 *
 * Supported platforms:
 * - Social: YouTube, TikTok, Twitter/X, Instagram, Facebook, Reddit, Pinterest, Tumblr
 * - Live: Twitch, Kick, Chaturbate
 * - Video: Vimeo, Dailymotion, Bilibili, Rumble, Odysee, VK, NicoNico
 * - Audio: SoundCloud, Mixcloud, Audiomack, Bandcamp, Jamendo, Last.fm, Beatport
 * - Media: Imgur, 9GAG, Coub, RedGifs, Streamable, Flickr
 * - Decentralized: PeerTube, Funkwhale
 * - Adult: PornHub, XVideos
 */

import { Client } from '../../core/client.js';
import {
  extract,
  isSupported,
  getExtractorName,
  listExtractors,
  type ExtractorResult,
  type Format,
} from '../../extractors/index.js';
import type { MCPTool, MCPToolResult } from '../types.js';
import type { MCPToolHandler } from './registry.js';

/**
 * Format result for MCP response
 */
function formatExtractorResult(result: ExtractorResult): Record<string, unknown> {
  return {
    id: result.id,
    title: result.title,
    description: result.description,
    uploader: result.uploader,
    uploaderId: result.uploaderId,
    duration: result.duration,
    thumbnail: result.thumbnail,
    isLive: result.isLive,
    ageLimit: result.ageLimit,
    viewCount: result.viewCount,
    likeCount: result.likeCount,
    commentCount: result.commentCount,
    timestamp: result.timestamp,
    formats: result.formats?.map(formatFormatInfo) || [],
    formatCount: result.formats?.length || 0,
  };
}

/**
 * Format a single format info
 */
function formatFormatInfo(format: Format): Record<string, unknown> {
  return {
    formatId: format.formatId,
    url: format.url,
    ext: format.ext,
    protocol: format.protocol,
    width: format.width,
    height: format.height,
    resolution: format.height ? `${format.height}p` : undefined,
    bandwidth: format.bandwidth,
    fps: format.fps,
    vcodec: format.vcodec,
    acodec: format.acodec,
    quality: format.quality,
  };
}

/**
 * Tool handlers
 */
export const videoToolHandlers: Record<string, MCPToolHandler> = {
  /**
   * Extract video information from URL
   */
  rek_video_info: async (args): Promise<MCPToolResult> => {
    const url = args.url as string;
    const preferExtractor = args.extractor as string | undefined;

    if (!url) {
      return {
        content: [{ type: 'text', text: 'Error: URL is required' }],
        isError: true,
      };
    }

    try {
      const client = new Client({
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      const result = await extract(url, client, { preferExtractor });
      const formatted = formatExtractorResult(result);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(formatted, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error extracting video info: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  },

  /**
   * Get available formats for a video
   */
  rek_video_formats: async (args): Promise<MCPToolResult> => {
    const url = args.url as string;

    if (!url) {
      return {
        content: [{ type: 'text', text: 'Error: URL is required' }],
        isError: true,
      };
    }

    try {
      const client = new Client({
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      const result = await extract(url, client);

      if (!result.formats || result.formats.length === 0) {
        return {
          content: [{ type: 'text', text: 'No formats found for this video' }],
        };
      }

      // Sort by quality (highest first)
      const sorted = [...result.formats].sort((a, b) => {
        const aQuality = a.height || a.bandwidth || 0;
        const bQuality = b.height || b.bandwidth || 0;
        return bQuality - aQuality;
      });

      const formats = sorted.map(formatFormatInfo);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            title: result.title,
            formatCount: formats.length,
            formats,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error getting formats: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  },

  /**
   * Check if a URL is supported
   */
  rek_video_check: async (args): Promise<MCPToolResult> => {
    const url = args.url as string;

    if (!url) {
      return {
        content: [{ type: 'text', text: 'Error: URL is required' }],
        isError: true,
      };
    }

    try {
      const supported = await isSupported(url, false);
      const extractorName = supported ? await getExtractorName(url) : null;

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            url,
            supported,
            extractor: extractorName,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error checking URL: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  },

  /**
   * List all supported extractors
   */
  rek_video_extractors: async (): Promise<MCPToolResult> => {
    const extractorList = listExtractors();

    // Group by category
    const categories: Record<string, string[]> = {
      'Social Media': ['youtube', 'tiktok', 'twitter', 'instagram', 'facebook', 'reddit', 'pinterest', 'tumblr'],
      'Live Streaming': ['twitch', 'kick', 'chaturbate'],
      'Video Platforms': ['vimeo', 'dailymotion', 'bilibili', 'rumble', 'odysee', 'vk', 'niconico', 'streamable'],
      'Audio Platforms': ['soundcloud', 'mixcloud', 'audiomack', 'bandcamp', 'jamendo', 'lastfm', 'beatport'],
      'Media/GIF': ['imgur', '9gag', 'coub', 'redgifs', 'flickr'],
      'Decentralized': ['peertube', 'funkwhale'],
      'Adult': ['pornhub', 'xvideos', 'xvideos:quickies'],
      'Other': [],
    };

    // Categorize extractors
    const categorized: Record<string, string[]> = {};
    const uncategorized: string[] = [];

    for (const extractor of extractorList) {
      if (extractor === 'generic') continue;

      let found = false;
      for (const [category, members] of Object.entries(categories)) {
        if (members.includes(extractor)) {
          if (!categorized[category]) categorized[category] = [];
          categorized[category].push(extractor);
          found = true;
          break;
        }
      }
      if (!found) {
        uncategorized.push(extractor);
      }
    }

    if (uncategorized.length > 0) {
      categorized['Other'] = uncategorized;
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          total: extractorList.length - 1, // Exclude generic
          categories: categorized,
          note: 'Use rek_video_check to verify if a specific URL is supported',
        }, null, 2),
      }],
    };
  },

  /**
   * Get direct download URL for best quality
   */
  rek_video_url: async (args): Promise<MCPToolResult> => {
    const url = args.url as string;
    const quality = (args.quality as string) || 'highest';

    if (!url) {
      return {
        content: [{ type: 'text', text: 'Error: URL is required' }],
        isError: true,
      };
    }

    try {
      const client = new Client({
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      const result = await extract(url, client);

      if (!result.formats || result.formats.length === 0) {
        return {
          content: [{ type: 'text', text: 'No downloadable formats found' }],
          isError: true,
        };
      }

      // Sort by quality
      const sorted = [...result.formats].sort((a, b) => {
        const aQuality = a.height || a.bandwidth || 0;
        const bQuality = b.height || b.bandwidth || 0;
        return bQuality - aQuality;
      });

      let selected: Format;
      if (quality === 'lowest') {
        selected = sorted[sorted.length - 1];
      } else if (quality.endsWith('p')) {
        const targetHeight = parseInt(quality.slice(0, -1), 10);
        selected = sorted.find(f => f.height === targetHeight) || sorted[0];
      } else {
        selected = sorted[0]; // highest
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            title: result.title,
            selected: formatFormatInfo(selected),
            downloadUrl: selected.url,
            isLive: result.isLive,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error getting download URL: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  },
};

/**
 * Video tool definitions
 */
export const videoTools: MCPTool[] = [
  {
    name: 'rek_video_info',
    description: 'Extract video/audio information from URL. Supports 35+ platforms: YouTube, TikTok, Twitch, Vimeo, SoundCloud, and more. Returns title, description, uploader, duration, formats, and metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Video/audio URL to extract information from',
        },
        extractor: {
          type: 'string',
          description: 'Prefer specific extractor (e.g., "youtube", "twitch")',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'rek_video_formats',
    description: 'Get available quality formats for a video. Returns list of formats with resolution, codec, and bandwidth info. Useful for selecting download quality.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Video URL to get formats for',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'rek_video_check',
    description: 'Check if a URL is supported by any video extractor. Returns whether the URL is supported and which extractor would handle it.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to check for support',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'rek_video_extractors',
    description: 'List all supported video/audio extractors grouped by category. Includes social media, live streaming, video platforms, audio platforms, and more.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'rek_video_url',
    description: 'Get direct download URL for a video in specified quality. Returns the best matching format URL for downloading.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Video URL to get download link for',
        },
        quality: {
          type: 'string',
          description: 'Quality preference: "highest", "lowest", or specific like "720p", "1080p"',
          default: 'highest',
        },
      },
      required: ['url'],
    },
  },
];
