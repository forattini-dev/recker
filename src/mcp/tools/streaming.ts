/**
 * Streaming MCP Tools
 *
 * Provides MCP tools for HLS (HTTP Live Streaming) and other streaming protocols.
 */

import type { MCPTool, MCPToolResult } from '../types.js';
import type { MCPToolHandler } from './registry.js';
import { createClient } from '../../core/client.js';
import { hls } from '../../plugins/hls.js';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: MCPTool['inputSchema'];
  handler: MCPToolHandler;
}

// ============================================================================
// HLS Tools
// ============================================================================

export const hlsInfoTool: ToolDefinition = {
  name: 'rek_hls_info',
  description:
    'Get information about an HLS stream including available variants, segments, and duration.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      url: {
        type: 'string',
        description: 'HLS manifest URL (m3u8)',
      },
      headers: {
        type: 'object',
        additionalProperties: { type: 'string' },
        description: 'Custom headers for the request',
      },
    },
    required: ['url'],
  },
  handler: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    const url = args.url as string;
    const headers = (args.headers as Record<string, string>) || {};

    const client = createClient({ headers });

    try {
      // Fetch and parse the manifest
      const response = await client.get(url);
      const manifest = await response.text();

      // Parse basic HLS manifest info
      const lines = manifest.split('\n').filter((l) => l.trim());
      const isVariantPlaylist = lines.some((l) => l.includes('#EXT-X-STREAM-INF'));
      const isMasterPlaylist = isVariantPlaylist;

      const info: Record<string, unknown> = {
        url,
        isMasterPlaylist,
        isMediaPlaylist: !isMasterPlaylist,
      };

      if (isMasterPlaylist) {
        // Parse variants
        const variants: Array<{
          bandwidth?: number;
          resolution?: string;
          codecs?: string;
          url: string;
        }> = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.startsWith('#EXT-X-STREAM-INF:')) {
            const attrs = line.substring(18);
            const bandwidthMatch = attrs.match(/BANDWIDTH=(\d+)/);
            const resolutionMatch = attrs.match(/RESOLUTION=([^\s,]+)/);
            const codecsMatch = attrs.match(/CODECS="([^"]+)"/);

            // Next non-comment line is the URL
            let variantUrl = '';
            for (let j = i + 1; j < lines.length; j++) {
              if (!lines[j].startsWith('#')) {
                variantUrl = lines[j].trim();
                break;
              }
            }

            if (variantUrl) {
              variants.push({
                bandwidth: bandwidthMatch ? parseInt(bandwidthMatch[1], 10) : undefined,
                resolution: resolutionMatch ? resolutionMatch[1] : undefined,
                codecs: codecsMatch ? codecsMatch[1] : undefined,
                url: new URL(variantUrl, url).href,
              });
            }
          }
        }

        info.variants = variants;
        info.variantCount = variants.length;
      } else {
        // Parse media playlist info
        const segments: Array<{
          duration: number;
          url: string;
        }> = [];

        let targetDuration: number | undefined;
        let mediaSequence = 0;
        let isLive = true;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          if (line.startsWith('#EXT-X-TARGETDURATION:')) {
            targetDuration = parseInt(line.split(':')[1], 10);
          } else if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
            mediaSequence = parseInt(line.split(':')[1], 10);
          } else if (line === '#EXT-X-ENDLIST') {
            isLive = false;
          } else if (line.startsWith('#EXTINF:')) {
            const duration = parseFloat(line.split(':')[1].split(',')[0]);
            // Next non-comment line is the segment URL
            for (let j = i + 1; j < lines.length; j++) {
              if (!lines[j].startsWith('#')) {
                segments.push({
                  duration,
                  url: new URL(lines[j].trim(), url).href,
                });
                break;
              }
            }
          }
        }

        const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0);

        info.targetDuration = targetDuration;
        info.mediaSequence = mediaSequence;
        info.isLive = isLive;
        info.segmentCount = segments.length;
        info.totalDuration = Math.round(totalDuration * 100) / 100;
        info.totalDurationFormatted = formatDuration(totalDuration);
        info.segments = segments.slice(0, 10); // First 10 segments only
        if (segments.length > 10) {
          info.segmentsTruncated = true;
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                ...info,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : String(error),
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
  },
};

export const hlsVariantsTool: ToolDefinition = {
  name: 'rek_hls_variants',
  description:
    'List all available quality variants from an HLS master playlist, sorted by bandwidth.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      url: {
        type: 'string',
        description: 'HLS master manifest URL (m3u8)',
      },
      headers: {
        type: 'object',
        additionalProperties: { type: 'string' },
        description: 'Custom headers for the request',
      },
    },
    required: ['url'],
  },
  handler: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    const url = args.url as string;
    const headers = (args.headers as Record<string, string>) || {};

    const client = createClient({ headers });

    try {
      const response = await client.get(url);
      const manifest = await response.text();

      const lines = manifest.split('\n').filter((l) => l.trim());
      const variants: Array<{
        bandwidth: number;
        resolution?: string;
        codecs?: string;
        frameRate?: number;
        url: string;
        label: string;
      }> = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('#EXT-X-STREAM-INF:')) {
          const attrs = line.substring(18);
          const bandwidthMatch = attrs.match(/BANDWIDTH=(\d+)/);
          const resolutionMatch = attrs.match(/RESOLUTION=([^\s,]+)/);
          const codecsMatch = attrs.match(/CODECS="([^"]+)"/);
          const frameRateMatch = attrs.match(/FRAME-RATE=([\d.]+)/);

          // Next non-comment line is the URL
          let variantUrl = '';
          for (let j = i + 1; j < lines.length; j++) {
            if (!lines[j].startsWith('#')) {
              variantUrl = lines[j].trim();
              break;
            }
          }

          if (variantUrl && bandwidthMatch) {
            const bandwidth = parseInt(bandwidthMatch[1], 10);
            const resolution = resolutionMatch ? resolutionMatch[1] : undefined;

            // Create label
            let label = formatBitrate(bandwidth);
            if (resolution) {
              const height = resolution.split('x')[1];
              label = `${height}p @ ${label}`;
            }

            variants.push({
              bandwidth,
              resolution,
              codecs: codecsMatch ? codecsMatch[1] : undefined,
              frameRate: frameRateMatch ? parseFloat(frameRateMatch[1]) : undefined,
              url: new URL(variantUrl, url).href,
              label,
            });
          }
        }
      }

      // Sort by bandwidth descending
      variants.sort((a, b) => b.bandwidth - a.bandwidth);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                url,
                variantCount: variants.length,
                variants,
                bestQuality: variants[0] || null,
                lowestQuality: variants[variants.length - 1] || null,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : String(error),
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
  },
};

export const hlsDownloadTool: ToolDefinition = {
  name: 'rek_hls_download',
  description:
    'Download an HLS stream to a local file. Supports VOD and limited live stream capture.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      url: {
        type: 'string',
        description: 'HLS manifest URL (m3u8)',
      },
      output: {
        type: 'string',
        description: 'Output file path (e.g., ./video.ts)',
      },
      headers: {
        type: 'object',
        additionalProperties: { type: 'string' },
        description: 'Custom headers for the request',
      },
      concurrency: {
        type: 'number',
        description: 'Number of concurrent segment downloads (default: 5)',
      },
      maxDuration: {
        type: 'number',
        description: 'Maximum duration to capture in seconds (for live streams)',
      },
    },
    required: ['url', 'output'],
  },
  handler: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    const url = args.url as string;
    const output = args.output as string;
    const headers = (args.headers as Record<string, string>) || {};
    const concurrency = (args.concurrency as number) || 5;
    const maxDuration = args.maxDuration as number | undefined;

    const client = createClient({ headers });

    try {
      const hlsOptions: {
        concurrency: number;
        live?: { duration: number };
      } = {
        concurrency,
      };

      if (maxDuration) {
        hlsOptions.live = { duration: maxDuration * 1000 };
      }

      const downloader = hls(client, url, hlsOptions);
      await downloader.download(output);

      // Get file stats
      const fs = await import('node:fs/promises');
      const stats = await fs.stat(output);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                url,
                output,
                fileSize: stats.size,
                fileSizeFormatted: formatBytes(stats.size),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : String(error),
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}h ${m}m ${s}s`;
  } else if (m > 0) {
    return `${m}m ${s}s`;
  } else {
    return `${s}s`;
  }
}

function formatBitrate(bps: number): string {
  if (bps >= 1_000_000) {
    return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  } else {
    return `${(bps / 1_000).toFixed(0)} kbps`;
  }
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) {
    return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
  } else if (bytes >= 1_000_000) {
    return `${(bytes / 1_000_000).toFixed(2)} MB`;
  } else if (bytes >= 1_000) {
    return `${(bytes / 1_000).toFixed(2)} KB`;
  } else {
    return `${bytes} bytes`;
  }
}

// ============================================================================
// Export all tools
// ============================================================================

export const streamingTools: ToolDefinition[] = [
  hlsInfoTool,
  hlsVariantsTool,
  hlsDownloadTool,
];
